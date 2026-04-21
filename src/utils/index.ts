import { Language } from '@/types';

// Language constants
export const LANGUAGES: Language[] = [
  { code: 'auto', name: 'Auto Detect', nativeName: 'Auto Detect' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' }
];

// Generate unique ID
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// Format date
export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}

// Format relative time
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  
  if (diff < minute) {
    return 'Just now';
  } else if (diff < hour) {
    const minutes = Math.floor(diff / minute);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diff < day) {
    const hours = Math.floor(diff / hour);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else if (diff < week) {
    const days = Math.floor(diff / day);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  } else if (diff < month) {
    const weeks = Math.floor(diff / week);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (diff < year) {
    const months = Math.floor(diff / month);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else {
    const years = Math.floor(diff / year);
    return `${years} year${years > 1 ? 's' : ''} ago`;
  }
}

// Text processing utilities
export function cleanText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function isValidText(text: string): boolean {
  return Boolean(text && text.trim().length > 0);
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Position calculation for popup (returns viewport-relative coordinates for position: fixed)
export function calculatePopupPosition(
  rect: DOMRect,
  popupWidth: number,
  popupHeight: number,
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-right'
): { x: number; y: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // DOMRect is already viewport-relative (getBoundingClientRect), no need to add scroll offset
  let x = rect.left;
  let y = rect.top;

  switch (position) {
    case 'top-right':
      x = rect.right;
      y = rect.top - popupHeight;
      break;
    case 'top-left':
      x = rect.left - popupWidth;
      y = rect.top - popupHeight;
      break;
    case 'bottom-right':
      x = rect.right;
      y = rect.bottom;
      break;
    case 'bottom-left':
      x = rect.left - popupWidth;
      y = rect.bottom;
      break;
  }

  // Ensure popup stays within viewport
  x = Math.max(10, Math.min(x, viewportWidth - popupWidth - 10));
  y = Math.max(10, Math.min(y, viewportHeight - popupHeight - 10));

  return { x, y };
}

// Get text selection and context
export function getTextSelection(): { text: string; rect: DOMRect | null; context: string } {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { text: '', rect: null, context: '' };
  }
  
  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();
  
  if (!text) {
    return { text: '', rect: null, context: '' };
  }
  
  const rect = range.getBoundingClientRect();
  
  // Get surrounding context
  const container = range.commonAncestorContainer;
  const parentText = container.parentElement?.textContent || container.textContent || '';
  const context = parentText.substring(0, 200); // Get first 200 chars as context
  
  return { text, rect, context };
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Chrome extension utilities
export function isChromeExtension(): boolean {
  return typeof globalThis !== 'undefined' && 
         typeof (globalThis as any).chrome !== 'undefined' && 
         (globalThis as any).chrome.runtime && 
         (globalThis as any).chrome.runtime.id;
} 