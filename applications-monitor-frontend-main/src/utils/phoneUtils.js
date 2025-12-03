
export function sanitizePhoneNumber(phoneNumber) {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return '';
  }

  const trimmed = phoneNumber.trim();
  const hasPlus = trimmed.startsWith('+');
  
  const digitsOnly = trimmed.replace(/\D/g, '');
  return hasPlus ? '+' + digitsOnly : digitsOnly;
}

