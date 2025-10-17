/**
 * JSON Schema type definitions for MCP tool parameter schemas
 * Based on JSON Schema Draft 07 specification
 */

export interface JSONSchemaProperty {
  type?: string | string[];
  description?: string;
  enum?: any[];
  default?: any;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JSONSchemaProperty;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JSONSchemaProperty;
}

export interface JSONSchema {
  $schema?: string;
  type?: string | string[];
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean | JSONSchemaProperty;
  description?: string;
  title?: string;
}
