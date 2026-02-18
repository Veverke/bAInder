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

export class DialogManager {
  constructor(containerElement) {
    this.container = containerElement || document.getElementById('modalContainer');
    this.currentDialog = null;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Close on backdrop click
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
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
   * Show a custom dialog
   */
  show(contentHTML, options = {}) {
    return new Promise((resolve, reject) => {
      this.currentDialog = { resolve, reject, options };

      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content ${options.size || 'medium'}">
          ${contentHTML}
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
   * Show a form dialog with custom fields
   */
  form(fields, title = 'Form', submitLabel = 'Submit') {
    let fieldHTML = fields.map((field, index) => {
      const id = `field-${index}`;
      const required = field.required ? 'required' : '';
      
      if (field.type === 'select') {
        const options = field.options.map(opt => {
          const optValue = opt.value !== undefined ? opt.value : opt;
          const optLabel = opt.label || opt;
          const isSelected = opt.selected || (field.value !== undefined && optValue == field.value);
          return `<option value="${this.escapeHtml(optValue)}"${isSelected ? ' selected' : ''}>
            ${this.escapeHtml(optLabel)}
          </option>`;
        }).join('');
        
        return `
          <div class="form-group">
            <label for="${id}">${this.escapeHtml(field.label)}</label>
            <select id="${id}" class="form-select" data-field="${field.name}" ${required}>
              ${options}
            </select>
            ${field.hint ? `<span class="form-hint">${this.escapeHtml(field.hint)}</span>` : ''}
          </div>
        `;
      } else if (field.type === 'textarea') {
        return `
          <div class="form-group">
            <label for="${id}">${this.escapeHtml(field.label)}</label>
            <textarea id="${id}" class="form-textarea" data-field="${field.name}" 
              placeholder="${this.escapeHtml(field.placeholder || '')}" ${required}>${this.escapeHtml(field.value || '')}</textarea>
            ${field.hint ? `<span class="form-hint">${this.escapeHtml(field.hint)}</span>` : ''}
          </div>
        `;
      } else {
        return `
          <div class="form-group">
            <label for="${id}">${this.escapeHtml(field.label)}</label>
            <input type="${field.type || 'text'}" id="${id}" class="form-input" 
              data-field="${field.name}" 
              value="${this.escapeHtml(field.value || '')}"
              placeholder="${this.escapeHtml(field.placeholder || '')}" ${required}>
            ${field.hint ? `<span class="form-hint">${this.escapeHtml(field.hint)}</span>` : ''}
          </div>
        `;
      }
    }).join('');

    const html = `
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

    return new Promise((resolve) => {
      this.show(html);
      
      const form = this.container.querySelector('[data-dialog-form]');
      const submitBtn = this.container.querySelector('[data-action="submit"]');
      const cancelBtn = this.container.querySelector('[data-action="cancel"]');
      
      // Handle submit
      const handleSubmit = () => {
        const formData = {};
        let isValid = true;
        
        fields.forEach(field => {
          const input = form.querySelector(`[data-field="${field.name}"]`);
          const value = input.value.trim();
          
          if (field.required && !value) {
            input.classList.add('error');
            isValid = false;
          } else {
            input.classList.remove('error');
          }
          
          formData[field.name] = value;
        });
        
        if (isValid) {
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
      
      // Enter key submits (for single-field forms)
      form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          handleSubmit();
        }
      });
      
      // Remove error class on input
      form.querySelectorAll('input, select, textarea').forEach(input => {
        input.addEventListener('input', () => {
          input.classList.remove('error');
        });
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
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
