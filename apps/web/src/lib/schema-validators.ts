import type { ValidationResult } from "./schema-types";

export function isJsonLdSchema(
  value: unknown,
): value is Record<string, unknown> & { "@context": string; "@type": string } {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj["@context"] === "https://schema.org" && typeof obj["@type"] === "string"
  );
}

export function validateSchema(
  schema: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];

  if (!schema["@context"]) {
    errors.push("Missing @context");
  }
  if (!schema["@type"]) {
    errors.push("Missing @type");
    return { valid: false, errors };
  }

  const type = schema["@type"] as string;

  switch (type) {
    case "Article": {
      if (!schema["headline"]) errors.push("Article requires headline");
      if (!schema["datePublished"])
        errors.push("Article requires datePublished");
      if (!schema["dateModified"]) errors.push("Article requires dateModified");
      if (!schema["publisher"]) errors.push("Article requires publisher");
      break;
    }
    case "FAQPage": {
      const mainEntity = schema["mainEntity"];
      if (
        !mainEntity ||
        (Array.isArray(mainEntity) && mainEntity.length === 0)
      ) {
        errors.push("FAQPage requires mainEntity");
      }
      break;
    }
    case "BreadcrumbList": {
      const items = schema["itemListElement"];
      if (!items || (Array.isArray(items) && items.length === 0)) {
        errors.push("BreadcrumbList requires itemListElement");
      }
      break;
    }
    case "ItemList": {
      const items = schema["itemListElement"];
      if (!items || (Array.isArray(items) && items.length === 0)) {
        errors.push("ItemList requires itemListElement");
      }
      break;
    }
    case "HowTo": {
      if (!schema["name"]) errors.push("HowTo requires name");
      const step = schema["step"];
      if (!step || (Array.isArray(step) && step.length === 0)) {
        errors.push("HowTo requires step");
      }
      break;
    }
    case "Organization": {
      if (!schema["name"]) errors.push("Organization requires name");
      if (!schema["url"]) errors.push("Organization requires url");
      break;
    }
    case "Product": {
      if (!schema["name"]) errors.push("Product requires name");
      if (!schema["offers"]) errors.push("Product requires offers");
      break;
    }
    case "SoftwareApplication": {
      if (!schema["name"]) errors.push("SoftwareApplication requires name");
      if (!schema["offers"]) errors.push("SoftwareApplication requires offers");
      break;
    }
    case "WebSite": {
      if (!schema["name"]) errors.push("WebSite requires name");
      if (!schema["url"]) errors.push("WebSite requires url");
      break;
    }
    default:
      break;
  }

  return { valid: errors.length === 0, errors };
}
