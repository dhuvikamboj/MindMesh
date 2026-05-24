export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_note',
      description:
        'Save a new note into the knowledge base. Use when the user shares information worth remembering.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short title for the note.' },
          content: { type: 'string', description: 'Full note text.' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_notes',
      description:
        'Search existing notes by keyword. Use to recall what the user told you earlier before answering.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Keywords to search for.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'link_notes',
      description:
        'Connect two notes in the mind map. Use note ids returned by search_notes or create_note.',
      parameters: {
        type: 'object',
        properties: {
          fromId: { type: 'string', description: 'Id of the first note.' },
          toId: { type: 'string', description: 'Id of the second note.' },
        },
        required: ['fromId', 'toId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_memory',
      description:
        'Remember a lasting fact about the user — preferences, goals, personal details. Use for things worth recalling in future conversations.',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'The fact about the user to remember.' },
        },
        required: ['fact'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_memory',
      description:
        'Recall facts previously saved about the user. Use when you need personal context to answer well.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What you want to recall about the user.' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description:
        'Create a named text or markdown file, save it to local storage, and attach it to a new knowledge note. Use when the user asks to write, draft, or save a document.',
      parameters: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'File name with extension, e.g. "plan.md".' },
          content: { type: 'string', description: 'Full text content of the file.' },
          title: { type: 'string', description: 'Title for the knowledge note. Defaults to the filename.' },
        },
        required: ['filename', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_note',
      description:
        'Read the full text content of a specific note by its id. Use before editing to see what is already there.',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: 'The id of the note to read.' },
        },
        required: ['noteId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_note',
      description:
        'Replace or append to the content of an existing note. Use search_notes or read_note first to get the note id.',
      parameters: {
        type: 'object',
        properties: {
          noteId: { type: 'string', description: 'Id of the note to edit.' },
          content: { type: 'string', description: 'New content to write.' },
          mode: {
            type: 'string',
            enum: ['replace', 'append'],
            description: '"replace" overwrites the note. "append" adds to the end.',
          },
        },
        required: ['noteId', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_profile',
      description:
        'Rewrite the always-in-context user profile. Use whenever you learn something new about who the user is, what they are doing, what they prefer, or anything worth keeping in mind across sessions. Replace the whole profile; keep it under ~200 words.',
      parameters: {
        type: 'object',
        properties: {
          profile: {
            type: 'string',
            description: 'New full profile text. Replaces the existing one.',
          },
        },
        required: ['profile'],
      },
    },
  },
] as const;

export const buildAgentSystemPrompt = (
  userProfile?: string,
  ragContext?: string,
  append?: string
): string => {
  const profileBlock = (userProfile ?? '').trim();
  const lines = [
    'You are MindMesh, a local AI assistant that helps the user capture and connect knowledge.',
    'Chat naturally and keep replies short and friendly.',
    '',
    'Use your tools when helpful:',
    '- create_note: when the user shares information worth remembering.',
    '- search_notes: to recall earlier notes before answering questions about them.',
    '- link_notes: to connect related notes. The mind map is built from notes and their links.',
    '- save_memory: to remember lasting facts about the user (preferences, goals, details).',
    '- recall_memory: to look up what you know about the user before answering.',
    '- update_profile: to rewrite the always-in-context profile below when something about the user changes.',
    '',
    'Always-in-context user profile (kept current by you):',
    profileBlock ? profileBlock : '(empty — call update_profile when you learn about the user)',
  ];

  if (ragContext) {
    lines.push(
      '',
      'Semantically relevant notes from the knowledge base (use these before calling search_notes):',
      ragContext
    );
  }

  lines.push('', 'After a tool runs you receive an OBSERVATION. Use it, then either call another tool or answer the user.');
  if (append?.trim()) {
    lines.push('', '--- Additional instructions ---', append.trim());
  }
  return lines.join('\n');
};
