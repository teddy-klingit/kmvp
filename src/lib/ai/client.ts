import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the environment. Never hardcode a key here.
export const anthropic = new Anthropic();

export const AGENT_MODEL = "claude-opus-5";
