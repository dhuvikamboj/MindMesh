export type ToolCall = {
  type: 'function';
  function: { name: string; arguments: string };
  id?: string;
};

export type UserFact = {
  id: string;
  text: string;
  embedding: number[];
  createdAt: string;
};

export type ChatRole = 'user' | 'assistant' | 'tool';

export type ChatTurn = {
  id: string;
  role: ChatRole;
  text: string;
  /** Set on tool turns — which tool produced this turn. */
  toolName?: string;
  /** Local file URIs of images attached to this turn. */
  imageUris?: string[];
  createdAt: string;
};

export type ChatSession = {
  id: string;
  title: string;
  turns: ChatTurn[];
  createdAt: string;
  updatedAt: string;
};
