// Names of the AI providers, safe to import in the browser.

export const PROVIDERS = ["claude-code", "anthropic", "openai", "deepseek", "ollama", "rules"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_TEXT: Record<ProviderId, { name: string; blurb: string }> = {
  "claude-code": { name: "Claude Code", blurb: "Your Claude subscription, through the claude command on this computer. No key to paste." },
  anthropic: { name: "Anthropic API", blurb: "An Anthropic API key, billed per use." },
  openai: { name: "OpenAI", blurb: "An OpenAI API key, billed per use." },
  deepseek: { name: "DeepSeek", blurb: "A DeepSeek API key, billed per use." },
  ollama: { name: "Ollama", blurb: "A model running on your computer. Free and private." },
  rules: { name: "No AI", blurb: "Simple rules: your sentences become the criteria." },
};
