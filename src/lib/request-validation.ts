/**
 * Request Validation Utilities
 * 
 * Provides simple validation for request bodies and query parameters
 * without requiring external dependencies.
 */

interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validates that required fields are present in request body
 */
export function validateRequestBody(
  body: any,
  requiredFields: string[]
): ValidationResult {
  const errors: string[] = []

  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      errors: ['Request body is required and must be an object'],
    }
  }

  for (const field of requiredFields) {
    if (!(field in body) || body[field] === undefined || body[field] === null) {
      errors.push(`Field '${field}' is required`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validates that required query parameters are present
 */
export function validateQueryParams(
  searchParams: URLSearchParams,
  requiredParams: string[]
): ValidationResult {
  const errors: string[] = []

  for (const param of requiredParams) {
    if (!searchParams.has(param) || searchParams.get(param) === null) {
      errors.push(`Query parameter '${param}' is required`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validates that a value is one of the allowed options
 */
export function validateEnum<T extends string>(
  value: any,
  allowedValues: readonly T[],
  fieldName: string = 'value'
): ValidationResult {
  if (!allowedValues.includes(value)) {
    return {
      valid: false,
      errors: [
        `'${fieldName}' must be one of: ${allowedValues.join(', ')}. Received: ${value}`,
      ],
    }
  }

  return { valid: true, errors: [] }
}

/**
 * Validates UUID format
 */
export function validateUUID(value: any, fieldName: string = 'id'): ValidationResult {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (typeof value !== 'string' || !uuidRegex.test(value)) {
    return {
      valid: false,
      errors: [`'${fieldName}' must be a valid UUID`],
    }
  }

  return { valid: true, errors: [] }
}






























