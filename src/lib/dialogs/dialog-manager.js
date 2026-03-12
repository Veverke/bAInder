/**
 * DialogManager - Handles modal dialogs in the side panel
 * 
 * Features:
 * - Create and manage modal dialogs
 * - Simple API for common dialog types (alert, confirm, prompt)
 * - Custom dialog support
 * - ESC key to close
 * - Click backdrop to close
 */

import { escapeHtml as _escHtml } from '../utils/search-utils.js';

export class DialogManager {
  constructor(containerElement) {
    this.container = containerElement || document.getElementById('modalContainer');
    this.currentDialog = null;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Track whether the mousedown started on the backdrop itself.
    // This prevents a drag-to-select gesture (mousedown inside an input,
    // mouseup landing on the backdrop) from incorrectly closing the dialog.
    let mousedownOnBackdrop = false;
    this.container.addEventListener('mousedown', (e) => {
      mousedownOnBackdrop = e.target === this.container;
    });

    // Close on backdrop click — only when the click originated on the backdrop
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container && mousedownOnBackdrop) {
        this.close();
      }
    });

    // Close on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.currentDialog) {
        this.close();
      }
    });
  }

  /**
   * Strip dangerous elements and attributes from an HTML string before
   * injecting it into the DOM via innerHTML.
   *
   * Removes:
   *   - All <script> elements
   *   - All event-handler attributes (on*)
   *   - javascript: URLs in href / src / action
   *
   * Uses a detached DOMParser document so no code runs during parsing.
   *
   * @param {string} html
   * @returns {string} sanitised HTML
   */
  _sanitiseHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Remove all <script> elements
    doc.querySelectorAll('script').forEach(el => el.remove());

    // Strip event-handler attributes and javascript: URLs from all elements
    doc.body.querySelectorAll('*').forEach(el => {
      for (const attr of [...el.attributes]) {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        if (
          (attr.name === 'href' || attr.name === 'src' || attr.name === 'action') &&
          /^\s*javascript:/i.test(attr.value)
        ) {
          el.removeAttribute(attr.name);
        }
      }
    });

    return doc.body.innerHTML;
  }

  /**
   * Show a custom dialog
   */
  show(contentHTML, options = {}) {
    return new Promise((resolve, reject) => {
      this.currentDialog = { resolve, reject, options };

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content ${options.size || 'medium'}">
          ${this._sanitiseHtml(contentHTML)}
        </div>
      `;

      this.container.innerHTML = '';
      this.container.appendChild(modal);
      this.container.style.display = 'flex';

      // Auto-focus first input
      setTimeout(() => {
        const firstInput = modal.querySelector('input, textarea, select, button');
        if (firstInput) {
          firstInput.focus();
        }
      }, 100);
    });
  }

  /**
   * Show an alert dialog
   */
  alert(message, title = 'Alert') {
    const html = `
      <div class="modal-header">
        <h2>${this.escapeHtml(title)}</h2>
      </div>
      <div class="modal-body">
        <p>${this.escapeHtml(message)}</p>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" data-action="ok">OK</button>
      </div>
    `;

    return new Promise((resolve) => {
      this.show(html).then(() => resolve());
      
      // Wire up OK button
      this.container.querySelector('[data-action="ok"]').addEventListener('click', () => {
        this.close(true);
      });
    });
  }

  /**
   * Show a confirm dialog
   */
  confirm(message, title = 'Confirm') {
    const html = `
      <div class="modal-header">
        <h2>${this.escapeHtml(title)}</h2>
      </div>
      <div class="modal-body">
        <p>${this.escapeHtml(message)}</p>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="cancel">Cancel</button>
        <button class="btn-primary" data-action="confirm">Confirm</button>
      </div>
    `;

    return new Promise((resolve) => {
      this.show(html);
      
      // Wire up buttons
      this.container.querySelector('[data-action="cancel"]').addEventListener('click', () => {
        this.close(false);
        resolve(false);
      });
      
      this.container.querySelector('[data-action="confirm"]').addEventListener('click', () => {
        this.close(true);
        resolve(true);
      });
    });
  }

  /**
   * Show a prompt dialog
   */
  prompt(message, defaultValue = '', title = 'Input') {
    const html = `
      <div class="modal-header">
        <h2>${this.escapeHtml(title)}</h2>
      </div>
      <div class="modal-body">
        <p>${this.escapeHtml(message)}</p>
        <input type="text" class="form-input" value="${this.escapeHtml(defaultValue)}" data-input="value">
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="cancel">Cancel</button>
        <button class="btn-primary" data-action="submit">OK</button>
      </div>
    `;

    return new Promise((resolve) => {
      this.show(html);
      
      const input = this.container.querySelector('[data-input="value"]');
      const submitBtn = this.container.querySelector('[data-action="submit"]');
      const cancelBtn = this.container.querySelector('[data-action="cancel"]');
      
      // Handle submit
      const handleSubmit = () => {
        const value = input.value.trim();
        if (value) {
          this.close(value);
          resolve(value);
        }
      };
      
      // Handle cancel
      const handleCancel = () => {
        this.close(null);
        resolve(null);
      };
      
      // Wire up buttons
      submitBtn.addEventListener('click', handleSubmit);
      cancelBtn.addEventListener('click', handleCancel);
      
      // Enter key submits
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleSubmit();
        }
      });
    });
  }

  /**
   * Render the HTML string for a single form field.
   * Pure: no DOM reads/writes — only produces an HTML string.
   * @param {Object} field  — field descriptor ({ type, name, label, value, placeholder, hint, required, options })
   * @param {number} index  — positional index used to generate a unique `id` attribute
   * @returns {string}
   */
  _renderFieldHtml(field, index) {
    const id       = `field-${index}`;
    const required = field.required ? 'required' : '';
    const hint     = field.hint
      ? `<span class="form-hint">${this.escapeHtml(field.hint)}</span>`
      : '';

    if (field.type === 'select') {
      const options = (field.options || []).map(opt => {
        const optValue   = opt.value !== undefined ? opt.value : opt;
        const optLabel   = opt.label || opt;
        const isSelected = opt.selected || (field.value !== undefined && optValue == field.value);
        return `<option value="${this.escapeHtml(optValue)}"${isSelected ? ' selected' : ''}>${this.escapeHtml(optLabel)}</option>`;
      }).join('');
      return `
          <div class="form-group">
            <label for="${id}">${this.escapeHtml(field.label)}</label>
            <select id="${id}" class="form-select" data-field="${field.name}" ${required}>
              ${options}
            </select>
            ${hint}
          </div>
        `;
    }

    if (field.type === 'textarea') {
      return `
          <div class="form-group">
            <label for="${id}">${this.escapeHtml(field.label)}</label>
            <textarea id="${id}" class="form-textarea" data-field="${field.name}"
              placeholder="${this.escapeHtml(field.placeholder || '')}" ${required}>${this.escapeHtml(field.value || '')}</textarea>
            ${hint}
          </div>
        `;
    }

    // Default: text, number, date, and all other input types
    return `
          <div class="form-group">
            <label for="${id}">${this.escapeHtml(field.label)}</label>
            <input type="${field.type || 'text'}" id="${id}" class="form-input"
              data-field="${field.name}"
              value="${this.escapeHtml(field.value || '')}"
              placeholder="${this.escapeHtml(field.placeholder || '')}" ${required}>
            ${hint}
          </div>
        `;
  }

  /**
   * Assemble the complete form dialog HTML (header + body + footer).
   * Pure: no DOM reads/writes — delegates per-field rendering to _renderFieldHtml.
   * @param {Object[]} fields
   * @param {string}   title
   * @param {string}   submitLabel
   * @returns {string}
   */
  _renderFormHtml(fields, title, submitLabel) {
    const fieldHTML = fields.map((field, i) => this._renderFieldHtml(field, i)).join('');
    return `
      <div class="modal-header">
        <h2>${this.escapeHtml(title)}</h2>
      </div>
      <div class="modal-body">
        <form class="dialog-form" data-dialog-form>
          ${fieldHTML}
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" data-action="cancel">Cancel</button>
        <button class="btn-primary" data-action="submit">${this.escapeHtml(submitLabel)}</button>
      </div>
    `;
  }

  /**
   * Read the current trimmed value for every field from the live form DOM.
   * @param {HTMLElement} formEl  — the <form> element containing [data-field] inputs
   * @param {Object[]}    fields
   * @returns {Object}  plain object keyed by field.name
   */
  _collectFormData(formEl, fields) {
    const formData = {};
    fields.forEach(field => {
      const input = formEl.querySelector(`[data-field="${field.name}"]`);
      formData[field.name] = input ? input.value.trim() : '';
    });
    return formData;
  }

  /**
   * Validate required fields and toggle the `.error` CSS class on each input.
   * Single responsibility: DOM mutation only — does not collect or return data.
   * @param {HTMLElement} formEl
   * @param {Object[]}    fields
   * @returns {boolean} true when every required field has a non-empty value
   */
  _validateForm(formEl, fields) {
    let isValid = true;
    fields.forEach(field => {
      const input = formEl.querySelector(`[data-field="${field.name}"]`);
      if (!input) return;
      if (field.required && !input.value.trim()) {
        input.classList.add('error');
        isValid = false;
      } else {
        input.classList.remove('error');
      }
    });
    return isValid;
  }

  /**
   * Show a form dialog with custom fields.
   * Orchestrates: render HTML → show → wire events → validate → resolve Promise.
   * @param {Object[]} fields       — array of field descriptors
   * @param {string}   title
   * @param {string}   submitLabel
   * @returns {Promise<Object|null>} resolves with formData on submit, null on cancel
   */
  form(fields, title = 'Form', submitLabel = 'Submit') {
    const html = this._renderFormHtml(fields, title, submitLabel);

    return new Promise((resolve) => {
      this.show(html);

      const formEl    = this.container.querySelector('[data-dialog-form]');
      const submitBtn = this.container.querySelector('[data-action="submit"]');
      const cancelBtn = this.container.querySelector('[data-action="cancel"]');

      // Handle submit: collect data first, then validate and resolve
      const handleSubmit = () => {
        const formData = this._collectFormData(formEl, fields);
        if (this._validateForm(formEl, fields)) {
          this.close(formData);
          resolve(formData);
        }
      };

      // Handle cancel
      const handleCancel = () => {
        this.close(null);
        resolve(null);
      };

      // Wire up buttons
      submitBtn.addEventListener('click', handleSubmit);
      cancelBtn.addEventListener('click', handleCancel);

      // Enter key submits (except in textareas and with Shift held)
      formEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleSubmit();
        }
      });

      // Clear error styling on user input
      formEl.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('input', () => input.classList.remove('error'));
      });
    });
  }

  /**
   * Close the current dialog
   */
  close(result) {
    if (this.currentDialog) {
      this.currentDialog.resolve(result);
      this.currentDialog = null;
    }
    
    this.container.style.display = 'none';
    this.container.innerHTML = '';
  }

  /**
   * Check if a dialog is currently open
   */
  isOpen() {
    return this.currentDialog !== null;
  }

  /**
   * Escape HTML to prevent XSS.
   * Delegates to the shared escapeHtml utility from search-utils.js.
   */
  escapeHtml(text) {
    return _escHtml(text);
  }
}
