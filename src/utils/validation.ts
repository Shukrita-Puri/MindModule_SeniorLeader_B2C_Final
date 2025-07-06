
export interface ValidationResult {
  isValid: boolean;
  message?: string;
}

export const validateRequired = (value: string, fieldName: string): ValidationResult => {
  if (!value || value.trim() === '') {
    return {
      isValid: false,
      message: `${fieldName} is required. Please fill in this field to continue.`
    };
  }
  return { isValid: true };
};

export const validateEmail = (email: string): ValidationResult => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!email) {
    return {
      isValid: false,
      message: 'Email address is required.'
    };
  }
  
  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      message: 'Please enter a valid email address (e.g., user@example.com).'
    };
  }
  
  return { isValid: true };
};

export const validateTextLength = (
  text: string, 
  minLength: number, 
  maxLength: number, 
  fieldName: string
): ValidationResult => {
  if (text.length < minLength) {
    return {
      isValid: false,
      message: `${fieldName} must be at least ${minLength} characters long.`
    };
  }
  
  if (text.length > maxLength) {
    return {
      isValid: false,
      message: `${fieldName} cannot exceed ${maxLength} characters.`
    };
  }
  
  return { isValid: true };
};

export const validateNumericRange = (
  value: number, 
  min: number, 
  max: number, 
  fieldName: string
): ValidationResult => {
  if (value < min || value > max) {
    return {
      isValid: false,
      message: `${fieldName} must be between ${min} and ${max}.`
    };
  }
  
  return { isValid: true };
};
