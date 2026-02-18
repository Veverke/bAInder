import { describe, it, expect, vi } from 'vitest';
import { setStorageMockData, getStorageMockCalls } from './setup.js';

describe('Chrome API Mocks', () => {
  describe('chrome.storage.local', () => {
    it('should mock get method', async () => {
      setStorageMockData({ topics: ['topic1', 'topic2'] });
      
      const result = await chrome.storage.local.get('topics');
      
      expect(result).toEqual({ topics: ['topic1', 'topic2'] });
      expect(chrome.storage.local.get).toHaveBeenCalledWith('topics');
    });

    it('should mock set method', async () => {
      const data = { topics: ['new-topic'] };
      
      await chrome.storage.local.set(data);
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith(data);
      
      const calls = getStorageMockCalls();
      expect(calls[0][0]).toEqual(data);
    });

    it('should mock getBytesInUse method', async () => {
      const result = await chrome.storage.local.getBytesInUse();
      
      expect(result).toBe(0);
      expect(chrome.storage.local.getBytesInUse).toHaveBeenCalled();
    });
  });

  describe('chrome.runtime', () => {
    it('should mock sendMessage', async () => {
      const message = { type: 'TEST', data: 'hello' };
      
      const response = await chrome.runtime.sendMessage(message);
      
      expect(response).toEqual({ success: true });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(message);
    });

    it('should mock getManifest', () => {
      const manifest = chrome.runtime.getManifest();
      
      expect(manifest).toHaveProperty('version');
      expect(manifest).toHaveProperty('name', 'bAInder');
    });
  });

  describe('chrome.tabs', () => {
    it('should mock query method', async () => {
      const tabs = await chrome.tabs.query({ active: true });
      
      expect(tabs).toBeInstanceOf(Array);
      expect(tabs[0]).toHaveProperty('id');
      expect(tabs[0]).toHaveProperty('url');
    });
  });
});

describe('Example Business Logic Tests', () => {
  describe('String utilities', () => {
    it('should convert string to uppercase', () => {
      const input = 'hello';
      const result = input.toUpperCase();
      
      expect(result).toBe('HELLO');
    });

    it('should check if string includes substring', () => {
      const text = 'Hello World';
      
      expect(text.includes('World')).toBe(true);
      expect(text.includes('xyz')).toBe(false);
    });
  });

  describe('Array operations', () => {
    it('should filter array', () => {
      const numbers = [1, 2, 3, 4, 5];
      const evens = numbers.filter(n => n % 2 === 0);
      
      expect(evens).toEqual([2, 4]);
    });

    it('should map array', () => {
      const numbers = [1, 2, 3];
      const doubled = numbers.map(n => n * 2);
      
      expect(doubled).toEqual([2, 4, 6]);
    });
  });
});
