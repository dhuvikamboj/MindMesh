import { useState, useCallback } from 'react';
import { initLlama, LlamaContext } from 'llama.rn';

import { ToolCall } from '@/types/agent';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data?: string; url?: string; format?: 'wav' | 'mp3' } };

export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
};

export type ResponseFormat = {
  type: 'text' | 'json_object' | 'json_schema';
  json_schema?: { name?: string; schema: object; strict?: boolean };
  schema?: object;
};

export type RunPromptOptions = {
  nPredict?: number;
  responseFormat?: ResponseFormat;
  temperature?: number;
  /** Seed the assistant turn with this text so generation continues from it. */
  prefill?: string;
  /** Set false to render the chat template without the reasoning channel. */
  enableThinking?: boolean;
  /** Native llama.rn tool definitions for function calling. */
  tools?: readonly unknown[];
  toolChoice?: 'auto' | 'none' | 'required';
  /** Called with each token as it is generated. */
  onToken?: (token: string) => void;
};

export type CompletionResult = {
  text: string;
  toolCalls: ToolCall[];
};

export const useLlama = () => {
  const [context, setContext] = useState<LlamaContext | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMultimodalReady, setIsMultimodalReady] = useState(false);

  const initModel = async (modelPath: string, mmprojPath?: string) => {
    setIsModelLoading(true);
    setError(null);
    setIsMultimodalReady(false);
    try {
      if (context) {
        await context.release();
      }
      const newContext = await initLlama({
        model: modelPath,
        use_mlock: true,
        n_ctx: 4096,
        n_gpu_layers: 99,
        // Multimodal requires disabling context shifting to keep media token offsets stable.
        ctx_shift: mmprojPath ? false : undefined,
      } as any);
      setContext(newContext);
      setMessages([
        { role: 'system', content: 'This is a conversation between user and assistant, a friendly chatbot.' }
      ]);

      if (mmprojPath) {
        try {
          const ok = await (newContext as any).initMultimodal({
            path: mmprojPath,
            use_gpu: true,
          });
          if (ok) {
            setIsMultimodalReady(true);
          }
        } catch (mmError) {
          console.log('[MindMesh] initMultimodal failed:', (mmError as Error)?.message);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load model');
    } finally {
      setIsModelLoading(false);
    }
  };

  const runPrompt = async (userText: string, options?: RunPromptOptions) => {
    if (!context) return;
    const prefill = options?.prefill ?? '';
    const newMessages: Message[] = [...messages, { role: 'user', content: userText }];
    setMessages([...newMessages, { role: 'assistant', content: prefill }]);
    setIsLoading(true);
    setError(null);

    try {
      const stopWords = [
        '</s>', '<|end|>', '<|eot_id|>',
        '<|end_of_text|>', '<|im_end|>',
        '<|EOT|>', '<|END_OF_TURN_TOKEN|>',
        '<|end_of_turn|>', '<|endoftext|>'
      ];
      let partialContent = prefill;

      // A trailing assistant message makes the model continue from `prefill`.
      const completionMessages: Message[] = prefill
        ? [...newMessages, { role: 'assistant', content: prefill }]
        : newMessages;

      const msgResult = await context.completion(
        {
          messages: completionMessages,
          n_predict: options?.nPredict ?? 384,
          stop: stopWords,
          ...(options?.temperature !== undefined
            ? { temperature: options.temperature }
            : {}),
          ...(options?.enableThinking === false
            ? { jinja: true, enable_thinking: false }
            : {}),
          ...(options?.responseFormat
            ? { response_format: options.responseFormat as any }
            : {}),
        },
        (data) => {
          partialContent += data.token;
          setMessages((prev) => {
            const up = [...prev];
            up[up.length - 1] = { role: 'assistant', content: partialContent };
            return up;
          });
        }
      );

      // If llama.rn honored the prefill the model continues mid-text, so add it
      // back. If it ignored it, the model already produced a full reply.
      const finalText =
        prefill && !msgResult.text.trimStart().startsWith(prefill)
          ? prefill + msgResult.text
          : msgResult.text;

      setMessages((prev) => {
        const up = [...prev];
        up[up.length - 1] = { role: 'assistant', content: finalText };
        return up;
      });

      return finalText;
    } catch (err: any) {
      setError(err.message || 'Failed to generate response');
    } finally {
      setIsLoading(false);
    }
  };

  const STOP_WORDS = [
    '</s>', '<|end|>', '<|eot_id|>',
    '<|end_of_text|>', '<|im_end|>',
    '<|EOT|>', '<|END_OF_TURN_TOKEN|>',
    '<|end_of_turn|>', '<|endoftext|>',
  ];

  /** One-shot completion over an explicit message list. Does not touch chat state. */
  const complete = async (
    msgs: Message[],
    options?: RunPromptOptions
  ): Promise<CompletionResult> => {
    if (!context) {
      throw new Error('Model not loaded.');
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await context.completion(
        {
          messages: msgs,
          n_predict: options?.nPredict ?? 512,
          stop: STOP_WORDS,
          ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options?.enableThinking === false
            ? { jinja: true, enable_thinking: false }
            : {}),
          ...(options?.tools
            ? { tools: options.tools, tool_choice: options.toolChoice ?? 'auto' }
            : {}),
        } as any,
        options?.onToken ? (data: { token: string }) => options.onToken!(data.token) : undefined
      );
      return {
        text: (result.content || result.text || '').trim(),
        toolCalls: (result.tool_calls ?? []) as ToolCall[],
      };
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (userText: string) => {
    await runPrompt(userText);
  };

  const releaseContext = useCallback(async () => {
    if (context) {
      await context.release();
      setContext(null);
    }
  }, [context]);

  return {
    isModelLoading,
    isLoading,
    error,
    messages,
    isReady: !!context,
    isMultimodalReady,
    initModel,
    runPrompt,
    complete,
    sendMessage,
    releaseContext
  };
};
