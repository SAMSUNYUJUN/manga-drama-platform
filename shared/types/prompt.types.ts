/**
 * Prompt related types
 * @module shared/types/prompt
 */

export interface PromptTemplate {
  id: number;
  name: string;
  description?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptTemplateVersion {
  id: number;
  templateId: number;
  version: number;
  name?: string | null;
  content: string;
  variables: string[];
  createdAt: Date;
}

export interface PromptRenderRequest {
  templateVersionId: number;
  variables: Record<string, string>;
}

export interface PromptRenderResponse {
  rendered: string;
  missingVariables: string[];
}
