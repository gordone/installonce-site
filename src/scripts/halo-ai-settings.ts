export const aiProviders = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  claude: { name: 'Claude', url: 'https://claude.ai/' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/' },
} as const;

export type AiProvider = keyof typeof aiProviders;
export const aiSettingsKey = 'halo.ai-settings.v1';

export function readAiSettings(): { provider: AiProvider | ''; context: string } {
  try {
    const value = JSON.parse(localStorage.getItem(aiSettingsKey) || '{}');
    return {
      provider: Object.hasOwn(aiProviders, value?.provider) ? value.provider : '',
      context: typeof value?.context === 'string' ? value.context.slice(0, 4000) : '',
    };
  } catch {
    return { provider: '', context: '' };
  }
}
