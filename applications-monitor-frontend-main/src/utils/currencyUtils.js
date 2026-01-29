/**
 * Currency utility functions for parsing and formatting
 */

/**
 * Parse amount from currency string (e.g., "$100", "₹100", "CAD100")
 * @param {string} amountStr - The amount string with currency symbol
 * @returns {number} - The numeric amount
 */
export const parseAmount = (amountStr) => {
  if (!amountStr) return 0;
  const str = amountStr.toString();
  // Remove currency symbols and whitespace: $, ₹, CAD, commas, spaces
  const cleaned = str.replace(/[$₹CAD,\s]/gi, '').trim();
  return parseFloat(cleaned) || 0;
};

/**
 * Extract currency symbol from amount string
 * @param {string} amountStr - The amount string with currency symbol
 * @returns {string} - The currency symbol ($, ₹, CAD, or empty)
 */
export const extractCurrency = (amountStr) => {
  if (!amountStr) return '';
  const str = amountStr.toString();
  if (str.startsWith('CAD')) return 'CAD';
  if (str.startsWith('₹')) return '₹';
  if (str.startsWith('$')) return '$';
  return '';
};

/**
 * Format amount with currency symbol for display
 * @param {number|string} amount - The numeric amount
 * @param {string} currency - The currency symbol ($, ₹, CAD)
 * @returns {string} - Formatted string (e.g., "$100", "₹100", "CAD 100")
 */
export const formatAmount = (amount, currency = '') => {
  const numAmount = typeof amount === 'string' ? parseAmount(amount) : (amount || 0);
  if (!currency) {
    // Try to extract from amount if it's a string
    currency = extractCurrency(amount);
  }
  
  if (currency === 'CAD') {
    return `CAD ${numAmount.toLocaleString()}`;
  } else if (currency === '₹') {
    return `₹${numAmount.toLocaleString()}`;
  } else if (currency === '$') {
    return `$${numAmount.toLocaleString()}`;
  }
  
  return numAmount.toLocaleString();
};

/**
 * Get currency display symbol for input prefix
 * @param {string} currency - The currency code ($, ₹, CAD)
 * @returns {string} - Display symbol
 */
export const getCurrencyPrefix = (currency) => {
  if (currency === 'CAD') return 'CAD';
  if (currency === '₹') return '₹';
  if (currency === '$') return '$';
  return '$';
};
