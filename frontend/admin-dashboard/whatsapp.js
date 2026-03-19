/**
 * WhatsApp Conversations Module
 * Split-panel chat interface for managing WhatsApp AI conversations
 */

// ==========================================
// STATE
// ==========================================

const waState = {
  conversations: [],
  filteredConversations: [],
  selectedConversationId: null,
  messages: [],
  searchQuery: '',
  pollingInterval: null,
  mobileShowChat: false,
  pendingImageUrl: null,
  pendingImageFile: null,
  uploadingImage: false,
  insights: null,
  insightsLoading: false,
  insightsVisible: false,
  labels: [],
  multiSelect: false,
  selectedConvIds: [],
  showArchived: false
};

// ==========================================
// STYLES
// ==========================================

function injectWhatsAppStyles() {
  if (document.getElementById('whatsapp-styles')) return;

  const style = document.createElement('style');
  style.id = 'whatsapp-styles';
  style.textContent = `
    .wa-layout {
      display: flex;
      height: calc(100vh - 120px);
      background: #fff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      border: 1px solid #e5e7eb;
    }

    /* Left panel - conversation list */
    .wa-list-panel {
      width: 360px;
      min-width: 300px;
      border-right: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      background: #fff;
    }

    .wa-list-header {
      padding: 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .wa-list-title {
      font-size: 18px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .wa-search-input {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;
    }

    .wa-search-input:focus {
      border-color: #e72a88;
    }

    .wa-search-input::placeholder {
      color: #aaa;
    }

    .wa-conv-list {
      flex: 1;
      overflow-y: auto;
    }

    .wa-conv-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      cursor: pointer;
      transition: background 0.15s;
      border-bottom: 1px solid #f5f5f5;
      position: relative;
    }

    .wa-conv-item:hover {
      background: #faf5f8;
    }

    .wa-conv-item.active {
      background: #fdf2f8;
      border-left: 3px solid #e72a88;
      padding-left: 13px;
    }

    .wa-conv-item.unread {
      background: #fefce8;
    }
    .wa-conv-item.unread .wa-conv-name {
      font-weight: 800;
      color: #000;
    }
    .wa-conv-item.unread .wa-conv-preview {
      color: #333;
      font-weight: 600;
    }
    .wa-conv-item.unread .wa-conv-time {
      color: #e72a88;
      font-weight: 600;
    }

    .wa-conv-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, #e72a88 0%, #f39223 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 16px;
      flex-shrink: 0;
    }

    .wa-conv-info {
      flex: 1;
      min-width: 0;
    }

    .wa-conv-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .wa-conv-name {
      font-weight: 600;
      font-size: 14px;
      color: #1a1a1a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 160px;
    }

    .wa-conv-time {
      font-size: 11px;
      color: #999;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .wa-conv-preview {
      font-size: 13px;
      color: #777;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }

    .wa-conv-meta {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .wa-intent-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }

    .wa-intent-order { background: #dcfce7; color: #166534; }
    .wa-intent-pricing { background: #dbeafe; color: #1e40af; }
    .wa-intent-question { background: #fef9c3; color: #854d0e; }
    .wa-intent-complaint { background: #fee2e2; color: #991b1b; }
    .wa-intent-greeting { background: #f3f4f6; color: #4b5563; }

    .wa-unread-count {
      background: #e72a88;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      min-width: 20px;
      height: 20px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
    }

    /* Right panel - chat view */
    .wa-chat-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #fafafa;
      min-width: 0;
    }

    .wa-chat-empty {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #aaa;
      gap: 12px;
      padding: 40px;
      text-align: center;
    }

    .wa-chat-empty-icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
    }

    .wa-chat-header {
      padding: 16px 20px;
      background: #fff;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .wa-chat-header-info {
      flex: 1;
      min-width: 0;
    }

    .wa-chat-header-name {
      font-weight: 700;
      font-size: 16px;
      color: #1a1a1a;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .wa-chat-header-phone {
      font-size: 13px;
      color: #888;
      margin-top: 2px;
    }

    .wa-chat-header-summary {
      font-size: 12px;
      color: #666;
      margin-top: 6px;
      padding: 6px 10px;
      background: #f9fafb;
      border-radius: 8px;
      border-left: 3px solid #e72a88;
      line-height: 1.4;
    }

    .wa-back-btn {
      display: none;
      background: none;
      border: none;
      cursor: pointer;
      color: #e72a88;
      font-size: 20px;
      padding: 4px;
      margin-right: 4px;
      flex-shrink: 0;
    }

    .wa-messages-area {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .wa-msg {
      max-width: 75%;
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 14px;
      line-height: 1.45;
      word-wrap: break-word;
      position: relative;
    }

    .wa-msg-inbound {
      align-self: flex-start;
      background: #e8e8e8;
      color: #1a1a1a;
      border-bottom-left-radius: 4px;
    }

    .wa-msg-ai {
      align-self: flex-end;
      background: #fce4ec;
      color: #1a1a1a;
      border-bottom-right-radius: 4px;
    }

    .wa-msg-admin {
      align-self: flex-end;
      background: #e72a88;
      color: #fff;
      border-bottom-right-radius: 4px;
    }

    .wa-msg-time {
      font-size: 10px;
      margin-top: 4px;
      opacity: 0.6;
    }

    .wa-msg-admin .wa-msg-time {
      opacity: 0.75;
    }

    .wa-msg-sender {
      font-size: 10px;
      font-weight: 600;
      margin-bottom: 2px;
      opacity: 0.7;
    }

    /* Input area */
    .wa-input-area {
      padding: 12px 16px;
      background: #fff;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .wa-input-field {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #e5e7eb;
      border-radius: 20px;
      font-size: 14px;
      outline: none;
      resize: none;
      max-height: 100px;
      min-height: 40px;
      line-height: 1.4;
      font-family: inherit;
      box-sizing: border-box;
    }

    .wa-input-field:focus {
      border-color: #e72a88;
    }

    .wa-send-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #e72a88;
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s, transform 0.1s;
    }

    .wa-send-btn:hover {
      background: #c91f73;
    }

    .wa-send-btn:active {
      transform: scale(0.94);
    }

    .wa-send-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    /* Empty state */
    .wa-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      color: #888;
      text-align: center;
      height: calc(100vh - 120px);
    }

    .wa-empty-state h3 {
      font-size: 16px;
      color: #555;
      margin-bottom: 8px;
    }

    .wa-empty-state p {
      font-size: 13px;
      color: #999;
      max-width: 320px;
      line-height: 1.5;
    }

    /* Loading */
    .wa-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: #aaa;
      font-size: 14px;
    }

    /* Date separator */
    .wa-date-sep {
      text-align: center;
      font-size: 11px;
      color: #999;
      padding: 8px 0;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .wa-date-sep::before,
    .wa-date-sep::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #e5e7eb;
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
      .wa-layout {
        height: calc(100vh - 80px);
        border-radius: 0;
      }

      .wa-list-panel {
        width: 100%;
        min-width: unset;
      }

      .wa-chat-panel {
        display: none;
        position: absolute;
        inset: 0;
        z-index: 10;
      }

      .wa-layout.wa-mobile-chat .wa-list-panel {
        display: none;
      }

      .wa-layout.wa-mobile-chat .wa-chat-panel {
        display: flex;
      }

      .wa-layout.wa-mobile-chat {
        position: relative;
      }

      .wa-back-btn {
        display: flex;
      }

      .wa-msg {
        max-width: 85%;
      }
    }

    /* Media elements in messages */
    .wa-msg-media-img {
      max-width: 250px;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 4px;
      display: block;
    }

    .wa-msg-audio {
      max-width: 250px;
      margin-bottom: 4px;
      display: block;
    }

    .wa-msg-transcription {
      font-size: 12px;
      font-style: italic;
      opacity: 0.7;
      margin-bottom: 4px;
      line-height: 1.3;
    }

    .wa-msg-doc-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      background: rgba(0,0,0,0.05);
      border-radius: 8px;
      text-decoration: none;
      color: inherit;
      font-size: 13px;
      margin-bottom: 4px;
      word-break: break-all;
    }

    .wa-msg-admin .wa-msg-doc-link {
      background: rgba(255,255,255,0.15);
      color: #fff;
    }

    .wa-msg-doc-link:hover {
      background: rgba(0,0,0,0.1);
    }

    .wa-msg-admin .wa-msg-doc-link:hover {
      background: rgba(255,255,255,0.25);
    }

    .wa-msg-thumbnails {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
      margin-bottom: 4px;
    }

    .wa-msg-thumbnail {
      width: 60px;
      height: 60px;
      border-radius: 6px;
      object-fit: cover;
      cursor: pointer;
      border: 1px solid rgba(0,0,0,0.1);
    }

    .wa-img-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #f3f4f6;
      color: #666;
      border: 1px solid #e5e7eb;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s, border-color 0.2s;
    }

    .wa-img-btn:hover {
      background: #e5e7eb;
      border-color: #d1d5db;
    }

    .wa-img-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .wa-img-preview-strip {
      padding: 8px 16px 0;
      background: #fff;
      border-top: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .wa-img-preview-thumb {
      width: 64px;
      height: 64px;
      border-radius: 8px;
      object-fit: cover;
      border: 2px solid #e72a88;
    }

    .wa-img-preview-info {
      flex: 1;
      font-size: 12px;
      color: #666;
      line-height: 1.4;
    }

    .wa-img-preview-name {
      font-weight: 600;
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }

    .wa-img-remove-btn {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: #fee2e2;
      color: #e74c3c;
      border: none;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .wa-img-remove-btn:hover {
      background: #fca5a5;
    }

    .wa-img-uploading {
      font-size: 12px;
      color: #e72a88;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ===== Insights Panel ===== */
    .wa-insights-panel {
      width: 320px;
      min-width: 280px;
      border-left: 1px solid #e5e7eb;
      display: none;
      flex-direction: column;
      background: #fff;
      overflow-y: auto;
    }
    .wa-insights-panel.wa-insights-visible {
      display: flex;
    }
    .wa-insights-header {
      padding: 16px;
      border-bottom: 1px solid #f0f0f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }
    .wa-insights-title {
      font-size: 16px;
      font-weight: 700;
      color: #1a1a1a;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .wa-insights-refresh-btn {
      background: none;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 12px;
      color: #666;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s;
    }
    .wa-insights-refresh-btn:hover {
      border-color: #e72a88;
      color: #e72a88;
    }
    .wa-insights-refresh-btn.loading {
      opacity: 0.5;
      pointer-events: none;
    }
    .wa-insights-list {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
    }
    .wa-insight-item {
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
      line-height: 1.5;
      display: flex;
      gap: 10px;
      align-items: flex-start;
      animation: waInsightFadeIn 0.3s ease;
    }
    @keyframes waInsightFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .wa-insight-icon {
      font-size: 16px;
      flex-shrink: 0;
      width: 24px;
      text-align: center;
      line-height: 1.4;
    }
    .wa-insight-text {
      flex: 1;
      min-width: 0;
      color: #333;
    }
    .wa-insight-high {
      background: #fef2f2;
      border-left: 3px solid #e72a88;
    }
    .wa-insight-medium {
      background: #fff7ed;
      border-left: 3px solid #f39223;
    }
    .wa-insight-low {
      background: #f0fdf4;
      border-left: 3px solid #8ab73b;
    }
    .wa-insights-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: #aaa;
      gap: 12px;
      text-align: center;
      flex: 1;
    }
    .wa-insights-loading-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #f0f0f0;
      border-top: 3px solid #e72a88;
      border-radius: 50%;
      animation: waInsightsSpin 0.8s linear infinite;
    }
    @keyframes waInsightsSpin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .wa-insights-empty {
      padding: 40px 20px;
      text-align: center;
      color: #999;
      font-size: 13px;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .wa-insights-toggle {
      display: inline-flex;
      background: none;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      color: #666;
      white-space: nowrap;
      margin-left: auto;
      flex-shrink: 0;
      transition: all 0.2s;
    }
    .wa-insights-toggle:hover {
      border-color: #e72a88;
      color: #e72a88;
    }
    .wa-insights-toggle.active {
      background: #fce4ec;
      border-color: #e72a88;
      color: #e72a88;
    }
    @media (max-width: 768px) {
      .wa-insights-panel {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        z-index: 20;
        box-shadow: -4px 0 12px rgba(0,0,0,0.1);
        width: 100%;
      }
    }

    /* ===== AI Toggle Button ===== */
    .wa-ai-toggle {
      background: none;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      flex-shrink: 0;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .wa-ai-toggle.ai-on {
      color: #16a34a;
      border-color: #bbf7d0;
      background: #f0fdf4;
    }
    .wa-ai-toggle.ai-on:hover {
      border-color: #16a34a;
      background: #dcfce7;
    }
    .wa-ai-toggle.ai-off {
      color: #dc2626;
      border-color: #fecaca;
      background: #fef2f2;
    }
    .wa-ai-toggle.ai-off:hover {
      border-color: #dc2626;
      background: #fee2e2;
    }
    .wa-ai-toggle-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .ai-on .wa-ai-toggle-dot { background: #16a34a; }
    .ai-off .wa-ai-toggle-dot { background: #dc2626; }

    /* ===== Recap Button ===== */
    .wa-recap-btn {
      background: #f0f4ff;
      border: 1px solid #c7d2fe;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      flex-shrink: 0;
      color: #4f46e5;
      font-weight: 600;
      transition: all 0.2s;
    }
    .wa-recap-btn:hover { background: #e0e7ff; border-color: #4f46e5; }
    .wa-recap-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* AI-off indicator in conversation list */
    .wa-conv-ai-off {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #dc2626;
      margin-left: 4px;
      flex-shrink: 0;
      vertical-align: middle;
      title: 'AI desactivada';
    }

    /* Media panel styles */
    .wa-media-btn {
      padding: 6px 12px;
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      margin-left: 6px;
      white-space: nowrap;
      transition: background 0.15s;
    }
    .wa-media-btn:hover { background: #e5e7eb; }

    .wa-media-panel-overlay {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.3);
      z-index: 100;
      display: flex;
      justify-content: flex-end;
    }

    .wa-media-panel {
      width: 340px;
      max-width: 90%;
      background: #fff;
      height: 100%;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 20px rgba(0,0,0,0.1);
      animation: waMediaSlideIn 0.2s ease;
    }
    @keyframes waMediaSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .wa-media-panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .wa-media-panel-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: #1a1a1a;
    }
    .wa-media-close-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: #888;
      font-size: 20px;
      padding: 4px 8px;
      border-radius: 6px;
    }
    .wa-media-close-btn:hover { background: #f3f4f6; color: #333; }

    .wa-media-tabs {
      display: flex;
      border-bottom: 1px solid #e5e7eb;
      padding: 0 16px;
    }
    .wa-media-tab {
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      color: #888;
      border: none;
      background: none;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s;
    }
    .wa-media-tab:hover { color: #333; }
    .wa-media-tab.active {
      color: #e72a88;
      border-bottom-color: #e72a88;
    }
    .wa-media-tab .wa-media-tab-count {
      display: inline-block;
      background: #f3f4f6;
      color: #666;
      font-size: 11px;
      padding: 1px 6px;
      border-radius: 10px;
      margin-left: 4px;
    }
    .wa-media-tab.active .wa-media-tab-count {
      background: #fce4ec;
      color: #e72a88;
    }

    .wa-media-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    .wa-media-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
    }
    .wa-media-grid-item {
      aspect-ratio: 1;
      border-radius: 4px;
      overflow: hidden;
      cursor: pointer;
      position: relative;
    }
    .wa-media-grid-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.15s;
    }
    .wa-media-grid-item:hover img { transform: scale(1.05); }
    .wa-media-grid-item .wa-media-date {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.6));
      color: #fff;
      font-size: 10px;
      padding: 12px 4px 3px;
      text-align: center;
    }

    .wa-media-file-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #f0f0f0;
      margin-bottom: 8px;
      cursor: pointer;
      transition: background 0.15s;
      text-decoration: none;
      color: inherit;
    }
    .wa-media-file-item:hover { background: #f9fafb; }
    .wa-media-file-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }
    .wa-media-file-icon.pdf { background: #fef2f2; }
    .wa-media-file-icon.img { background: #f0fdf4; }
    .wa-media-file-icon.doc { background: #eff6ff; }
    .wa-media-file-icon.other { background: #f9fafb; }
    .wa-media-file-info {
      flex: 1;
      min-width: 0;
    }
    .wa-media-file-name {
      font-size: 13px;
      font-weight: 600;
      color: #1a1a1a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .wa-media-file-meta {
      font-size: 11px;
      color: #999;
      margin-top: 2px;
    }

    .wa-media-link-item {
      display: block;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #f0f0f0;
      margin-bottom: 8px;
      cursor: pointer;
      transition: background 0.15s;
      text-decoration: none;
    }
    .wa-media-link-item:hover { background: #f9fafb; }
    .wa-media-link-url {
      font-size: 12px;
      color: #09adc2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: block;
    }
    .wa-media-link-context {
      font-size: 11px;
      color: #999;
      margin-top: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .wa-media-empty {
      text-align: center;
      padding: 40px 20px;
      color: #999;
      font-size: 13px;
    }
    .wa-media-empty-icon {
      font-size: 32px;
      margin-bottom: 8px;
      opacity: 0.4;
    }

    /* Multi-select mode */
    .wa-multiselect-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: linear-gradient(135deg, #fce4ec, #f3e5f5);
      border-bottom: 1px solid #f0e0e8;
      animation: waContextFadeIn 0.18s ease;
    }
    .wa-multiselect-count {
      font-size: 13px;
      font-weight: 600;
      color: #e72a88;
      flex: 1;
    }
    .wa-multiselect-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s;
    }
    .wa-multiselect-btn:active { transform: scale(0.95); }
    .wa-multiselect-btn.delete {
      background: #dc2626;
      color: white;
    }
    .wa-multiselect-btn.delete:hover { background: #b91c1c; }
    .wa-multiselect-btn.archive {
      background: #3b82f6;
      color: white;
    }
    .wa-multiselect-btn.archive:hover { background: #2563eb; }
    .wa-multiselect-btn.cancel {
      background: #f3f4f6;
      color: #666;
    }
    .wa-multiselect-btn.cancel:hover { background: #e5e7eb; }
    .wa-multiselect-btn.select-all {
      background: transparent;
      color: #e72a88;
      border: 1px solid #e72a88;
    }
    .wa-conv-checkbox {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid #d1d5db;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      cursor: pointer;
    }
    .wa-conv-checkbox.checked {
      background: #e72a88;
      border-color: #e72a88;
    }
    .wa-conv-checkbox.checked::after {
      content: '\u2713';
      color: white;
      font-size: 12px;
      font-weight: 700;
    }
    .wa-select-toggle {
      padding: 4px 10px;
      background: none;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 11px;
      color: #888;
      cursor: pointer;
      white-space: nowrap;
    }
    .wa-select-toggle:hover { background: #f3f4f6; color: #333; }

    /* Context menu */
    .wa-context-menu {
      position: fixed;
      background: rgba(255,255,255,0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 14px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
      border: 1px solid rgba(0,0,0,0.06);
      padding: 8px;
      z-index: 1000;
      min-width: 220px;
      animation: waContextFadeIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes waContextFadeIn {
      from { opacity: 0; transform: scale(0.92) translateY(-4px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .wa-context-item {
      padding: 10px 14px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #1a1a1a;
      border-radius: 8px;
      transition: all 0.12s ease;
      letter-spacing: -0.01em;
    }
    .wa-context-item:hover { background: #f0f0f0; transform: translateX(2px); }
    .wa-context-item:active { transform: scale(0.98); }
    .wa-context-icon {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
    }
    .wa-context-icon.labels { background: linear-gradient(135deg, #fce4ec, #f3e5f5); }
    .wa-context-icon.pin { background: linear-gradient(135deg, #fff3e0, #fff8e1); }
    .wa-context-icon.archive { background: linear-gradient(135deg, #e3f2fd, #e8eaf6); }
    .wa-context-icon.delete { background: linear-gradient(135deg, #ffebee, #fce4ec); }
    .wa-context-item.danger { color: #dc2626; }
    .wa-context-item.danger:hover { background: #fff1f1; }
    .wa-context-separator {
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(0,0,0,0.06), transparent);
      margin: 6px 8px;
    }
    .wa-context-submenu {
      padding: 8px 12px;
    }
    .wa-context-submenu-title {
      font-size: 11px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .wa-label-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.1s;
    }
    .wa-label-option:hover { background: #f3f4f6; }
    .wa-label-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .wa-label-check {
      margin-left: auto;
      font-size: 14px;
    }
    .wa-new-label-row {
      display: flex;
      gap: 6px;
      margin-top: 6px;
      padding-top: 6px;
      border-top: 1px solid #f0f0f0;
    }
    .wa-new-label-input {
      flex: 1;
      font-size: 12px;
      padding: 4px 8px;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
    }
    .wa-new-label-color {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      padding: 0;
    }
    .wa-new-label-btn {
      padding: 4px 8px;
      background: #e72a88;
      color: #fff;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
    }

    /* Label pills in conversation list */
    .wa-conv-labels {
      display: flex;
      gap: 3px;
      flex-wrap: nowrap;
      overflow: hidden;
      flex-shrink: 1;
      min-width: 0;
    }
    .wa-conv-label-pill {
      font-size: 9px;
      padding: 1px 5px;
      border-radius: 6px;
      color: #fff;
      font-weight: 600;
      line-height: 1.4;
      white-space: nowrap;
      max-width: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Pin indicator */
    .wa-conv-pin {
      font-size: 12px;
      margin-left: auto;
      flex-shrink: 0;
    }

    /* Archive filter tabs */
    .wa-archive-tabs {
      display: flex;
      gap: 4px;
      padding: 6px 16px;
      border-bottom: 1px solid #f0f0f0;
    }
    .wa-archive-tab {
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      border: none;
      background: none;
      color: #888;
      cursor: pointer;
      border-radius: 12px;
    }
    .wa-archive-tab.active { background: #fce4ec; color: #e72a88; }

    /* ===== Follow-up Button & Dropdown ===== */
    .wa-followup-btn {
      background: #fff7ed;
      border: 1px solid #fed7aa;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      flex-shrink: 0;
      color: #ea580c;
      font-weight: 600;
      transition: all 0.2s;
      position: relative;
    }
    .wa-followup-btn:hover { background: #ffedd5; border-color: #ea580c; }

    .wa-followup-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      z-index: 100;
      min-width: 140px;
      overflow: hidden;
    }
    .wa-followup-dropdown-item {
      display: block;
      width: 100%;
      padding: 8px 14px;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
      font-size: 13px;
      color: #374151;
      transition: background 0.15s;
    }
    .wa-followup-dropdown-item:hover { background: #f3f4f6; }
    .wa-followup-dropdown-item.danger { color: #dc2626; }
    .wa-followup-dropdown-item.danger:hover { background: #fef2f2; }

    /* ===== Follow-up Badge in Conversation List ===== */
    .wa-followup-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 10px;
      margin-left: 4px;
      flex-shrink: 0;
      white-space: nowrap;
      vertical-align: middle;
    }
    .wa-followup-badge.pending {
      background: #fff7ed;
      color: #ea580c;
      border: 1px solid #fed7aa;
    }
    .wa-followup-badge.expired {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
      animation: wa-followup-pulse 2s ease-in-out infinite;
    }
    @keyframes wa-followup-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
  `;
  document.head.appendChild(style);
}

// ==========================================
// UTILITIES
// ==========================================

function waEsc(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function waTimeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return 'ahora';
  if (mins < 60) return 'hace ' + mins + ' min';
  if (hrs < 24) return 'hace ' + hrs + (hrs === 1 ? ' hora' : ' horas');
  if (days < 30) return 'hace ' + days + (days === 1 ? ' dia' : ' dias');
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

function waFormatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

// WhatsApp rich text renderer — safely renders **bold**, *italic*, ~strikethrough~, _italic_, URLs, and newlines
function waRenderRichText(container, text) {
  if (!text) return;
  // Escape HTML entities first for safety
  var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // WhatsApp formatting: **bold**, *bold* (single), _italic_, ~strikethrough~
  var formatted = escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~(.+?)~/g, '<del>$1</del>')
    // URLs → clickable links
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:#09adc2;text-decoration:underline;">$1</a>')
    // Newlines → <br>
    .replace(/\n/g, '<br>');
  // Use a template element for safe parsing (no script execution)
  var template = document.createElement('template');
  template.innerHTML = formatted;
  container.appendChild(template.content);
}

function waFormatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function waGetInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].substring(0, 2).toUpperCase();
}

function waGetIntentBadgeHTML(intent) {
  const intents = {
    order:     { emoji: '\uD83D\uDED2', label: 'Pedido',      cls: 'wa-intent-order' },
    pricing:   { emoji: '\uD83D\uDCB0', label: 'Cotizacion',  cls: 'wa-intent-pricing' },
    question:  { emoji: '\u2753',        label: 'Pregunta',    cls: 'wa-intent-question' },
    complaint: { emoji: '\u26A0\uFE0F',  label: 'Queja',       cls: 'wa-intent-complaint' },
    greeting:  { emoji: '\uD83D\uDC4B',  label: 'Saludo',      cls: 'wa-intent-greeting' }
  };
  if (!intent || !intents[intent]) return '';
  const i = intents[intent];
  return '<span class="wa-intent-badge ' + i.cls + '">' + i.emoji + ' ' + i.label + '</span>';
}

function waTruncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.substring(0, max) + '...';
}

// ==========================================
// DATA LOADING
// ==========================================

async function loadWhatsAppConversations() {
  injectWhatsAppStyles();

  const container = document.getElementById('whatsapp-container');
  if (!container) return;

  // Show loading only on first load
  if (waState.conversations.length === 0) {
    container.textContent = '';
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'wa-loading';
    loadingDiv.textContent = 'Cargando conversaciones...';
    container.appendChild(loadingDiv);
  }

  try {
    await loadWhatsAppLabels();
    var convUrl = API_BASE + '/whatsapp/conversations';
    if (waState.showArchived) convUrl += '?archived=true';
    const res = await fetch(convUrl, {
      headers: getAuthHeaders()
    });
    const json = await res.json();

    if (json.success) {
      waState.conversations = json.data || [];
      waFilterConversations();
      renderWhatsApp();
      updateWaUnreadBadge();
      startWhatsAppPolling();
    } else {
      container.textContent = '';
      const errDiv = document.createElement('div');
      errDiv.className = 'wa-loading';
      errDiv.style.color = '#e74c3c';
      errDiv.textContent = 'Error cargando conversaciones';
      container.appendChild(errDiv);
    }
  } catch (err) {
    console.error('Error loading WhatsApp conversations:', err);
    container.textContent = '';
    const errDiv = document.createElement('div');
    errDiv.className = 'wa-loading';
    errDiv.style.color = '#e74c3c';
    errDiv.textContent = 'Error de conexion';
    container.appendChild(errDiv);
  }
}

async function fetchConversationMessages(conversationId) {
  try {
    const res = await fetch(API_BASE + '/whatsapp/conversations/' + conversationId + '/messages', {
      headers: getAuthHeaders()
    });
    const json = await res.json();
    if (json.success) {
      waState.messages = json.data || [];
      return true;
    }
  } catch (err) {
    console.error('Error loading messages:', err);
  }
  return false;
}

async function markConversationRead(conversationId) {
  try {
    await fetch(API_BASE + '/whatsapp/conversations/' + conversationId + '/read', {
      method: 'PUT',
      headers: getAuthHeaders()
    });
    var conv = waState.conversations.find(function(c) { return c.id === conversationId; });
    if (conv) conv.unread_count = 0;
    updateWaUnreadBadge();
    renderConversationList();
  } catch (err) {
    console.error('Error marking read:', err);
  }
}

async function markConversationUnread(conversationId) {
  try {
    await fetch(API_BASE + '/whatsapp/conversations/' + conversationId + '/unread', {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
    });
    var conv = waState.conversations.find(function(c) { return c.id === conversationId; });
    if (conv) conv.unread_count = 1;
    updateWaUnreadBadge();
    renderConversationList();
  } catch (err) {
    console.error('Error marking unread:', err);
  }
}

async function sendReply(conversationId, message, imageUrl) {
  try {
    var payload = { message: message };
    if (imageUrl) {
      payload.imageUrl = imageUrl;
    }
    const res = await fetch(API_BASE + '/whatsapp/conversations/' + conversationId + '/reply', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    return json.success;
  } catch (err) {
    console.error('Error sending reply:', err);
    return false;
  }
}

// ==========================================
// LABELS & CONTEXT MENU ACTIONS
// ==========================================

async function loadWhatsAppLabels() {
  try {
    var res = await fetch(API_BASE + '/whatsapp/labels', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
    });
    var data = await res.json();
    if (data.success) waState.labels = data.data || [];
  } catch (e) { console.error('Failed to load labels:', e); }
}

async function togglePinConversation(convId, isPinned) {
  try {
    await fetch(API_BASE + '/whatsapp/conversations/' + convId + '/pin', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') },
      body: JSON.stringify({ is_pinned: isPinned })
    });
    await reloadConversations();
  } catch (e) { console.error('Failed to toggle pin:', e); }
}

async function toggleArchiveConversation(convId, isArchived) {
  try {
    await fetch(API_BASE + '/whatsapp/conversations/' + convId + '/archive', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') },
      body: JSON.stringify({ is_archived: isArchived })
    });
    await reloadConversations();
  } catch (e) { console.error('Failed to toggle archive:', e); }
}

async function deleteConversation(convId) {
  if (!confirm('Eliminar esta conversacion y todos sus mensajes? Esta accion no se puede deshacer.')) return;
  try {
    await fetch(API_BASE + '/whatsapp/conversations/' + convId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
    });
    if (waState.selectedConversationId === convId) {
      waState.selectedConversationId = null;
      waState.messages = [];
    }
    await reloadConversations();
  } catch (e) { console.error('Failed to delete conversation:', e); }
}

async function toggleConversationLabel(convId, labelId, isAssigned) {
  try {
    if (isAssigned) {
      await fetch(API_BASE + '/whatsapp/conversations/' + convId + '/labels/' + labelId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
      });
    } else {
      await fetch(API_BASE + '/whatsapp/conversations/' + convId + '/labels/' + labelId, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
      });
    }
    await loadWhatsAppLabels();
    await reloadConversations();
  } catch (e) { console.error('Failed to toggle label:', e); }
}

async function createNewLabel(name, color) {
  try {
    var res = await fetch(API_BASE + '/whatsapp/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') },
      body: JSON.stringify({ name: name, color: color })
    });
    var data = await res.json();
    if (data.success) {
      await loadWhatsAppLabels();
    }
    return data;
  } catch (e) { console.error('Failed to create label:', e); return null; }
}

function updateGlobalAiButton(enabled) {
  var btn = document.getElementById('wa-global-ai-btn');
  if (!btn) return;
  btn.dataset.enabled = enabled ? 'true' : 'false';
  if (enabled) {
    btn.style.background = '#10b981';
    btn.style.color = '#fff';
    btn.textContent = 'AI ON';
  } else {
    btn.style.background = '#ef4444';
    btn.style.color = '#fff';
    btn.textContent = 'AI OFF';
  }
}

async function reloadConversations() {
  try {
    var url = API_BASE + '/whatsapp/conversations';
    if (waState.showArchived) url += '?archived=true';
    var res = await fetch(url, { headers: getAuthHeaders() });
    var json = await res.json();
    if (json.success) {
      waState.conversations = json.data || [];
      waFilterConversations();
      renderConversationList();
      updateWaUnreadBadge();
    }
  } catch (e) { console.error('Failed to reload conversations:', e); }
}

// ==========================================
// MULTI-SELECT BULK ACTIONS
// ==========================================

function updateMultiSelectUI() {
  // Update count
  var countEl = document.getElementById('wa-ms-count');
  if (countEl) countEl.textContent = waState.selectedConvIds.length + ' seleccionados';

  // Update checkboxes
  var items = document.querySelectorAll('.wa-conv-item');
  items.forEach(function(item) {
    var convId = parseInt(item.getAttribute('data-conv-id'));
    var cb = item.querySelector('.wa-conv-checkbox');
    if (cb) {
      if (waState.selectedConvIds.indexOf(convId) !== -1) {
        cb.classList.add('checked');
      } else {
        cb.classList.remove('checked');
      }
    }
  });
}

async function bulkAction(action) {
  var ids = waState.selectedConvIds;
  if (ids.length === 0) return;

  if (action === 'delete') {
    if (!confirm('Eliminar ' + ids.length + ' conversaciones? Esta accion no se puede deshacer.')) return;
  }

  var token = localStorage.getItem('admin_token');
  var promises = ids.map(function(id) {
    if (action === 'delete') {
      return fetch(API_BASE + '/whatsapp/conversations/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    } else if (action === 'archive') {
      return fetch(API_BASE + '/whatsapp/conversations/' + id + '/archive', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ is_archived: true })
      });
    }
  });

  await Promise.all(promises);
  waState.multiSelect = false;
  waState.selectedConvIds = [];
  waState.selectedConversationId = null;
  reloadConversations();
}

function closeContextMenu() {
  var existing = document.querySelector('.wa-context-menu');
  if (existing) existing.remove();
}

function showConversationContextMenu(e, conv) {
  e.preventDefault();
  e.stopPropagation();
  closeContextMenu();

  var menu = document.createElement('div');
  menu.className = 'wa-context-menu';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  // --- Labels submenu ---
  var labelItem = document.createElement('div');
  labelItem.className = 'wa-context-item';
  var labelIcon = document.createElement('span');
  labelIcon.className = 'wa-context-icon labels';
  labelIcon.textContent = '\uD83C\uDFF7\uFE0F';
  labelItem.appendChild(labelIcon);
  labelItem.appendChild(document.createTextNode('Etiquetas'));
  labelItem.addEventListener('click', function(ev) {
    ev.stopPropagation();
    // Toggle submenu visibility
    var sub = menu.querySelector('.wa-context-submenu');
    if (sub) {
      sub.style.display = sub.style.display === 'none' ? 'block' : 'none';
    }
  });
  menu.appendChild(labelItem);

  // Labels submenu content
  var subMenu = document.createElement('div');
  subMenu.className = 'wa-context-submenu';
  var subTitle = document.createElement('div');
  subTitle.className = 'wa-context-submenu-title';
  subTitle.textContent = 'Etiquetas';
  subMenu.appendChild(subTitle);

  var convLabels = conv.labels || [];
  var convLabelIds = convLabels.map(function(l) { return l.id; });

  waState.labels.forEach(function(label) {
    var isAssigned = convLabelIds.indexOf(label.id) !== -1;
    var opt = document.createElement('div');
    opt.className = 'wa-label-option';

    var dot = document.createElement('span');
    dot.className = 'wa-label-dot';
    dot.style.background = label.color;
    opt.appendChild(dot);

    var nameSpan = document.createElement('span');
    nameSpan.textContent = label.name;
    opt.appendChild(nameSpan);

    var check = document.createElement('span');
    check.className = 'wa-label-check';
    check.textContent = isAssigned ? '\u2705' : '';
    opt.appendChild(check);

    opt.addEventListener('click', function(ev) {
      ev.stopPropagation();
      toggleConversationLabel(conv.id, label.id, isAssigned);
      closeContextMenu();
    });
    subMenu.appendChild(opt);
  });

  // New label form
  var newRow = document.createElement('div');
  newRow.className = 'wa-new-label-row';

  var newInput = document.createElement('input');
  newInput.className = 'wa-new-label-input';
  newInput.type = 'text';
  newInput.placeholder = 'Nueva etiqueta...';
  newInput.maxLength = 50;
  newRow.appendChild(newInput);

  var colorPicker = document.createElement('input');
  colorPicker.className = 'wa-new-label-color';
  colorPicker.type = 'color';
  colorPicker.value = '#e72a88';
  newRow.appendChild(colorPicker);

  var addBtn = document.createElement('button');
  addBtn.className = 'wa-new-label-btn';
  addBtn.textContent = '+';
  addBtn.addEventListener('click', function(ev) {
    ev.stopPropagation();
    var name = newInput.value.trim();
    if (!name) return;
    createNewLabel(name, colorPicker.value).then(function() {
      closeContextMenu();
    });
  });
  newRow.appendChild(addBtn);

  // Prevent menu close on input clicks
  newInput.addEventListener('click', function(ev) { ev.stopPropagation(); });
  colorPicker.addEventListener('click', function(ev) { ev.stopPropagation(); });

  subMenu.appendChild(newRow);
  menu.appendChild(subMenu);

  // --- Mark as read/unread ---
  var unreadItem = document.createElement('div');
  unreadItem.className = 'wa-context-item';
  var unreadIcon = document.createElement('span');
  unreadIcon.className = 'wa-context-icon';
  unreadIcon.style.background = 'linear-gradient(135deg, #dbeafe, #e0e7ff)';
  unreadIcon.textContent = conv.unread_count > 0 ? '\uD83D\uDC41' : '\uD83D\uDD35';
  unreadItem.appendChild(unreadIcon);
  unreadItem.appendChild(document.createTextNode(conv.unread_count > 0 ? 'Marcar como leido' : 'Marcar como no leido'));
  unreadItem.addEventListener('click', function() {
    if (conv.unread_count > 0) {
      markConversationRead(conv.id);
    } else {
      markConversationUnread(conv.id);
    }
    closeContextMenu();
  });
  menu.appendChild(unreadItem);

  // --- Pin/Unpin ---
  var pinItem = document.createElement('div');
  pinItem.className = 'wa-context-item';
  var pinIcon = document.createElement('span');
  pinIcon.className = 'wa-context-icon pin';
  pinIcon.textContent = '\uD83D\uDCCC';
  pinItem.appendChild(pinIcon);
  pinItem.appendChild(document.createTextNode(conv.is_pinned ? 'Desfijar' : 'Fijar'));
  pinItem.addEventListener('click', function() {
    togglePinConversation(conv.id, !conv.is_pinned);
    closeContextMenu();
  });
  menu.appendChild(pinItem);

  // --- Archive/Unarchive ---
  var archiveItem = document.createElement('div');
  archiveItem.className = 'wa-context-item';
  var archiveIcon = document.createElement('span');
  archiveIcon.className = 'wa-context-icon archive';
  archiveIcon.textContent = '\uD83D\uDCE5';
  archiveItem.appendChild(archiveIcon);
  archiveItem.appendChild(document.createTextNode(conv.is_archived ? 'Desarchivar' : 'Archivar'));
  archiveItem.addEventListener('click', function() {
    toggleArchiveConversation(conv.id, !conv.is_archived);
    closeContextMenu();
  });
  menu.appendChild(archiveItem);

  // --- Separator ---
  var sep = document.createElement('div');
  sep.className = 'wa-context-separator';
  menu.appendChild(sep);

  // --- Delete ---
  var deleteItem = document.createElement('div');
  deleteItem.className = 'wa-context-item danger';
  var deleteIcon = document.createElement('span');
  deleteIcon.className = 'wa-context-icon delete';
  deleteIcon.textContent = '\uD83D\uDDD1\uFE0F';
  deleteItem.appendChild(deleteIcon);
  deleteItem.appendChild(document.createTextNode('Eliminar'));
  deleteItem.addEventListener('click', function() {
    closeContextMenu();
    deleteConversation(conv.id);
  });
  menu.appendChild(deleteItem);

  document.body.appendChild(menu);

  // Keep menu within viewport
  var rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
  }

  // Close on click outside
  setTimeout(function() {
    document.addEventListener('click', closeContextMenu, { once: true });
  }, 0);
}

// ==========================================
// POLLING
// ==========================================

function startWhatsAppPolling() {
  stopWhatsAppPolling();
  waState.pollingInterval = setInterval(async function() {
    try {
      var pollUrl = API_BASE + '/whatsapp/conversations';
      if (waState.showArchived) pollUrl += '?archived=true';
      const res = await fetch(pollUrl, {
        headers: getAuthHeaders()
      });
      const json = await res.json();
      if (json.success) {
        waState.conversations = json.data || [];
        waFilterConversations();
        renderConversationList();
        updateWaUnreadBadge();

        // If a conversation is open, refresh its messages too
        if (waState.selectedConversationId) {
          const ok = await fetchConversationMessages(waState.selectedConversationId);
          if (ok) renderChatMessages();
        }
      }
    } catch (err) {
      console.error('WhatsApp polling error:', err);
    }
  }, 5000);
}

function stopWhatsAppPolling() {
  if (waState.pollingInterval) {
    clearInterval(waState.pollingInterval);
    waState.pollingInterval = null;
  }
}

function updateWaUnreadBadge() {
  var badge = document.getElementById('wa-unread-badge');
  if (!badge) return;

  var total = 0;
  for (var i = 0; i < waState.conversations.length; i++) {
    total += (waState.conversations[i].unread_count || 0);
  }

  if (total > 0) {
    badge.textContent = total > 99 ? '99+' : String(total);
    badge.style.display = 'inline-flex';
  } else {
    badge.textContent = '';
    badge.style.display = 'none';
  }
}

// ==========================================
// FILTERING
// ==========================================

function waFilterConversations() {
  var q = waState.searchQuery.toLowerCase().trim();
  if (!q) {
    waState.filteredConversations = waState.conversations.slice();
    waState.searchResults = null;
  } else if (waState.searchResults) {
    // Use server search results if available
    waState.filteredConversations = waState.searchResults;
  } else {
    // Instant local filter on name/phone while server search loads
    waState.filteredConversations = waState.conversations.filter(function(c) {
      var name = (c.client_name || '').toLowerCase();
      var phone = (c.wa_id || '').toLowerCase();
      var labelMatch = (c.labels || []).some(function(l) { return l.name.toLowerCase().indexOf(q) !== -1; });
      return name.indexOf(q) !== -1 || phone.indexOf(q) !== -1 || labelMatch;
    });
  }
  // Sort: expired follow-ups first, then pinned, then most recent message
  var now = new Date();
  waState.filteredConversations.sort(function(a, b) {
    // Expired follow-ups rise to top
    var fuExpA = a.follow_up_at && new Date(a.follow_up_at) <= now ? 1 : 0;
    var fuExpB = b.follow_up_at && new Date(b.follow_up_at) <= now ? 1 : 0;
    if (fuExpA !== fuExpB) return fuExpB - fuExpA;

    var pinA = a.is_pinned ? 1 : 0;
    var pinB = b.is_pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    var dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    var dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return dateB - dateA;
  });
}

// ==========================================
// RENDERING - MAIN LAYOUT
// ==========================================

function renderWhatsApp() {
  var container = document.getElementById('whatsapp-container');
  if (!container) return;

  // Clear container
  container.textContent = '';

  // Empty state: no conversations at all
  if (waState.conversations.length === 0) {
    var emptyWrap = document.createElement('div');
    emptyWrap.className = 'wa-empty-state';

    var iconWrap = document.createElement('div');
    iconWrap.style.cssText = 'width:80px;height:80px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center;font-size:36px;margin-bottom:16px;';
    var iconEl = document.createElement('i');
    iconEl.setAttribute('data-lucide', 'message-circle');
    iconEl.style.cssText = 'width:36px;height:36px;color:#ccc;';
    iconWrap.appendChild(iconEl);
    emptyWrap.appendChild(iconWrap);

    var emptyH3 = document.createElement('h3');
    emptyH3.textContent = 'No hay conversaciones aun';
    emptyWrap.appendChild(emptyH3);

    var emptyP = document.createElement('p');
    emptyP.textContent = 'Los mensajes de WhatsApp apareceran aqui automaticamente.';
    emptyWrap.appendChild(emptyP);

    container.appendChild(emptyWrap);
    if (typeof lucide !== 'undefined') lucide.createIcons();
    return;
  }

  // Build split-panel layout
  var layout = document.createElement('div');
  layout.className = 'wa-layout';
  layout.id = 'wa-layout';
  if (waState.mobileShowChat && waState.selectedConversationId) {
    layout.classList.add('wa-mobile-chat');
  }

  // --- Left panel ---
  var listPanel = document.createElement('div');
  listPanel.className = 'wa-list-panel';

  // --- Clean header: search + AI toggle + settings ---
  var listHeader = document.createElement('div');
  listHeader.className = 'wa-list-header';
  listHeader.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid #f0f0f0;';

  var searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'wa-search-input';
  searchInput.id = 'wa-search';
  searchInput.placeholder = 'Buscar...';
  searchInput.value = waState.searchQuery;
  searchInput.style.cssText = 'flex:1;font-size:13px;padding:8px 12px;border:none;background:#f5f5f7;border-radius:10px;outline:none;';
  listHeader.appendChild(searchInput);

  // Global AI toggle
  var aiGlobalBtn = document.createElement('button');
  aiGlobalBtn.id = 'wa-global-ai-btn';
  aiGlobalBtn.style.cssText = 'padding:6px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;border:none;white-space:nowrap;transition:all 0.15s;';
  aiGlobalBtn.addEventListener('click', function() {
    var currentState = aiGlobalBtn.dataset.enabled === 'true';
    var newState = !currentState;
    fetch(API_BASE + '/whatsapp/ai-global', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') },
      body: JSON.stringify({ enabled: newState })
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.success) updateGlobalAiButton(data.globalAiEnabled);
    });
  });
  listHeader.appendChild(aiGlobalBtn);

  // Settings gear (model selector in popover)
  var settingsBtn = document.createElement('button');
  settingsBtn.style.cssText = 'width:32px;height:32px;border-radius:8px;border:none;background:#f5f5f7;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background 0.15s;flex-shrink:0;';
  settingsBtn.textContent = '\u2699\uFE0F';
  settingsBtn.title = 'Configuracion IA';
  settingsBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var existing = document.getElementById('wa-settings-popover');
    if (existing) { existing.remove(); return; }

    var pop = document.createElement('div');
    pop.id = 'wa-settings-popover';
    pop.style.cssText = 'position:absolute;top:52px;right:12px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.12);border:1px solid #e5e7eb;padding:12px;z-index:100;min-width:200px;';

    var popLabel = document.createElement('div');
    popLabel.style.cssText = 'font-size:11px;color:#888;font-weight:600;margin-bottom:6px;';
    popLabel.textContent = 'MODELO DE IA';
    pop.appendChild(popLabel);

    var modelSelect = document.createElement('select');
    modelSelect.id = 'wa-model-select';
    modelSelect.style.cssText = 'width:100%;font-size:13px;padding:6px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#333;cursor:pointer;';
    var models = [
      { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5 (barato)' },
      { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5 (medio)' },
      { value: 'claude-sonnet-4-6-20250514', label: 'Sonnet 4.6 (mejor)' }
    ];
    for (var mi = 0; mi < models.length; mi++) {
      var opt = document.createElement('option');
      opt.value = models[mi].value;
      opt.textContent = models[mi].label;
      modelSelect.appendChild(opt);
    }
    modelSelect.onchange = function() {
      fetch(API_BASE + '/whatsapp/ai-model', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') },
        body: JSON.stringify({ model: modelSelect.value })
      }).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success) {
          modelSelect.style.borderColor = '#25d366';
          setTimeout(function() { modelSelect.style.borderColor = '#e5e7eb'; }, 1500);
        }
      });
    };
    pop.appendChild(modelSelect);

    // Close on outside click
    setTimeout(function() {
      document.addEventListener('click', function closePopover(ev) {
        if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', closePopover); }
      });
    }, 10);

    listHeader.style.position = 'relative';
    listHeader.appendChild(pop);

    // Load current model
    fetch(API_BASE + '/whatsapp/ai-model', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
    }).then(function(r) { return r.json(); }).then(function(data) {
      if (data.model) modelSelect.value = data.model;
    });
  });
  listHeader.appendChild(settingsBtn);

  listPanel.appendChild(listHeader);

  // Load AI state
  fetch(API_BASE + '/whatsapp/ai-model', {
    headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
  }).then(function(r) { return r.json(); }).then(function(data) {
    if (typeof data.globalAiEnabled !== 'undefined') {
      updateGlobalAiButton(data.globalAiEnabled);
    }
  });

  // Archive tabs
  var archiveTabs = document.createElement('div');
  archiveTabs.className = 'wa-archive-tabs';

  var tabAll = document.createElement('button');
  tabAll.className = 'wa-archive-tab' + (!waState.showArchived ? ' active' : '');
  tabAll.textContent = 'Todas';
  tabAll.addEventListener('click', function() {
    if (!waState.showArchived) return;
    waState.showArchived = false;
    reloadConversations();
    tabAll.classList.add('active');
    tabArchived.classList.remove('active');
  });
  archiveTabs.appendChild(tabAll);

  var tabArchived = document.createElement('button');
  tabArchived.className = 'wa-archive-tab' + (waState.showArchived ? ' active' : '');
  tabArchived.textContent = 'Archivadas';
  tabArchived.addEventListener('click', function() {
    if (waState.showArchived) return;
    waState.showArchived = true;
    reloadConversations();
    tabArchived.classList.add('active');
    tabAll.classList.remove('active');
  });
  archiveTabs.appendChild(tabArchived);

  // Select toggle button
  var selectToggle = document.createElement('button');
  selectToggle.className = 'wa-select-toggle';
  selectToggle.textContent = 'Seleccionar';
  selectToggle.style.marginLeft = 'auto';
  selectToggle.addEventListener('click', function() {
    waState.multiSelect = !waState.multiSelect;
    waState.selectedConvIds = [];
    renderWhatsApp();
  });
  archiveTabs.appendChild(selectToggle);

  listPanel.appendChild(archiveTabs);

  // Multi-select toolbar (shown when in select mode)
  if (waState.multiSelect) {
    var msBar = document.createElement('div');
    msBar.className = 'wa-multiselect-bar';

    var msCount = document.createElement('span');
    msCount.className = 'wa-multiselect-count';
    msCount.id = 'wa-ms-count';
    msCount.textContent = waState.selectedConvIds.length + ' seleccionados';
    msBar.appendChild(msCount);

    var selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'wa-multiselect-btn select-all';
    selectAllBtn.textContent = 'Todos';
    selectAllBtn.addEventListener('click', function() {
      if (waState.selectedConvIds.length === waState.filteredConversations.length) {
        waState.selectedConvIds = [];
      } else {
        waState.selectedConvIds = waState.filteredConversations.map(function(c) { return c.id; });
      }
      updateMultiSelectUI();
    });
    msBar.appendChild(selectAllBtn);

    var archiveBtn = document.createElement('button');
    archiveBtn.className = 'wa-multiselect-btn archive';
    archiveBtn.textContent = '\uD83D\uDCE5 Archivar';
    archiveBtn.addEventListener('click', function() { bulkAction('archive'); });
    msBar.appendChild(archiveBtn);

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'wa-multiselect-btn delete';
    deleteBtn.textContent = '\uD83D\uDDD1 Eliminar';
    deleteBtn.addEventListener('click', function() { bulkAction('delete'); });
    msBar.appendChild(deleteBtn);

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'wa-multiselect-btn cancel';
    cancelBtn.textContent = '\u2715';
    cancelBtn.addEventListener('click', function() {
      waState.multiSelect = false;
      waState.selectedConvIds = [];
      renderWhatsApp();
    });
    msBar.appendChild(cancelBtn);

    listPanel.appendChild(msBar);
  }

  var convListDiv = document.createElement('div');
  convListDiv.className = 'wa-conv-list';
  convListDiv.id = 'wa-conv-list';
  buildConversationListDOM(convListDiv);
  listPanel.appendChild(convListDiv);

  layout.appendChild(listPanel);

  // --- Right panel ---
  var chatPanel = document.createElement('div');
  chatPanel.className = 'wa-chat-panel';
  chatPanel.id = 'wa-chat-panel';

  if (waState.selectedConversationId) {
    buildChatViewDOM(chatPanel);
  } else {
    buildChatEmptyDOM(chatPanel);
  }

  layout.appendChild(chatPanel);

  // --- Insights panel (third column) ---
  if (waState.selectedConversationId) {
    var insightsPanel = document.createElement('div');
    insightsPanel.className = 'wa-insights-panel';
    insightsPanel.id = 'wa-insights-panel';
    if (waState.insightsVisible) {
      insightsPanel.classList.add('wa-insights-visible');
    }
    buildInsightsPanelDOM(insightsPanel);
    layout.appendChild(insightsPanel);
  }

  container.appendChild(layout);

  // Bind events
  bindWhatsAppEvents();

  if (typeof lucide !== 'undefined') lucide.createIcons();

  if (waState.selectedConversationId) {
    scrollChatToBottom();
  }
}

// ==========================================
// RENDERING - CONVERSATION LIST (DOM)
// ==========================================

function buildConversationListDOM(parentEl) {
  parentEl.textContent = '';
  var convs = waState.filteredConversations;

  if (convs.length === 0) {
    var noResult = document.createElement('div');
    noResult.style.cssText = 'padding:30px 20px;text-align:center;color:#999;font-size:13px;';
    if (waState.searchQuery) {
      noResult.textContent = 'Sin resultados para "' + waState.searchQuery + '"';
    } else {
      noResult.textContent = 'Sin conversaciones';
    }
    parentEl.appendChild(noResult);
    return;
  }

  for (var i = 0; i < convs.length; i++) {
    var c = convs[i];
    parentEl.appendChild(buildConversationItemDOM(c));
  }
}

function buildConversationItemDOM(c) {
  var displayName = c.client_name || c.wa_id || 'Desconocido';
  var rawPreview = c.last_message || '';
  // Replace media placeholders with emoji indicators
  if (rawPreview.startsWith('[Imagen]') || rawPreview === '[Imagen]') {
    rawPreview = '\uD83D\uDCF7 Imagen';
  } else if (rawPreview.startsWith('[Audio')) {
    rawPreview = '\uD83C\uDFA4 Audio';
  } else if (rawPreview.startsWith('[Documento')) {
    rawPreview = '\uD83D\uDCC4 Documento';
  }
  // If server search found a matching message, show that instead
  if (c.matching_message && waState.searchQuery && waState.searchResults) {
    rawPreview = '\uD83D\uDD0D ' + c.matching_message;
  }
  var preview = waTruncate(rawPreview, 50);
  var time = waTimeAgo(c.last_message_at);
  var isActive = c.id === waState.selectedConversationId;
  var unread = c.unread_count || 0;
  var initials = waGetInitials(displayName);

  var item = document.createElement('div');
  item.className = 'wa-conv-item' + (isActive ? ' active' : '') + (unread > 0 ? ' unread' : '');
  item.setAttribute('data-conv-id', c.id);

  // Right-click context menu
  item.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    showConversationContextMenu(e, c);
  });

  // Checkbox (multi-select mode)
  if (waState.multiSelect) {
    var isChecked = waState.selectedConvIds.indexOf(c.id) !== -1;
    var checkbox = document.createElement('div');
    checkbox.className = 'wa-conv-checkbox' + (isChecked ? ' checked' : '');
    checkbox.addEventListener('click', (function(convId) {
      return function(e) {
        e.stopPropagation();
        var idx = waState.selectedConvIds.indexOf(convId);
        if (idx === -1) {
          waState.selectedConvIds.push(convId);
        } else {
          waState.selectedConvIds.splice(idx, 1);
        }
        updateMultiSelectUI();
      };
    })(c.id));
    item.appendChild(checkbox);
  }

  // Avatar
  var avatar = document.createElement('div');
  avatar.className = 'wa-conv-avatar';
  avatar.textContent = initials;
  item.appendChild(avatar);

  // Info container
  var info = document.createElement('div');
  info.className = 'wa-conv-info';

  // Header row (name + time)
  var headerRow = document.createElement('div');
  headerRow.className = 'wa-conv-header-row';

  var nameSpan = document.createElement('span');
  nameSpan.className = 'wa-conv-name';
  nameSpan.textContent = displayName;
  headerRow.appendChild(nameSpan);

  // Pin indicator
  if (c.is_pinned) {
    var pinSpan = document.createElement('span');
    pinSpan.className = 'wa-conv-pin';
    pinSpan.textContent = '\uD83D\uDCCC';
    pinSpan.title = 'Fijada';
    headerRow.appendChild(pinSpan);
  }

  // AI-off indicator (red dot)
  if (c.ai_enabled === false) {
    var aiOffDot = document.createElement('span');
    aiOffDot.className = 'wa-conv-ai-off';
    aiOffDot.title = 'AI desactivada';
    headerRow.appendChild(aiOffDot);
  }

  // Follow-up badge
  if (c.follow_up_at) {
    var fuDate = new Date(c.follow_up_at);
    var now = new Date();
    var fuBadge = document.createElement('span');
    if (fuDate <= now) {
      fuBadge.className = 'wa-followup-badge expired';
      fuBadge.textContent = '\uD83D\uDD14 Follow up';
      fuBadge.title = 'Follow-up vencido';
    } else {
      var diffDays = Math.ceil((fuDate - now) / (1000 * 60 * 60 * 24));
      fuBadge.className = 'wa-followup-badge pending';
      fuBadge.textContent = '\u23F1 ' + diffDays + 'd';
      fuBadge.title = 'Follow-up en ' + diffDays + ' dia(s)';
    }
    headerRow.appendChild(fuBadge);
  }

  var timeSpan = document.createElement('span');
  timeSpan.className = 'wa-conv-time';
  timeSpan.textContent = time;
  headerRow.appendChild(timeSpan);

  info.appendChild(headerRow);

  // Preview
  var previewDiv = document.createElement('div');
  previewDiv.className = 'wa-conv-preview';
  previewDiv.textContent = preview;
  info.appendChild(previewDiv);

  // Meta (intent badge + unread)
  var metaDiv = document.createElement('div');
  metaDiv.className = 'wa-conv-meta';

  if (c.intent) {
    var badgeSpan = buildIntentBadgeDOM(c.intent);
    if (badgeSpan) metaDiv.appendChild(badgeSpan);
  }

  if (unread > 0) {
    var unreadSpan = document.createElement('span');
    unreadSpan.className = 'wa-unread-count';
    unreadSpan.textContent = unread;
    metaDiv.appendChild(unreadSpan);
  }

  info.appendChild(metaDiv);

  // Label pills — inline next to name
  var convLabels = c.labels || [];
  if (convLabels.length > 0) {
    var labelsDiv = document.createElement('div');
    labelsDiv.className = 'wa-conv-labels';
    convLabels.forEach(function(label) {
      var pill = document.createElement('span');
      pill.className = 'wa-conv-label-pill';
      pill.style.background = label.color;
      pill.textContent = label.name;
      labelsDiv.appendChild(pill);
    });
    headerRow.insertBefore(labelsDiv, timeSpan);
  }

  item.appendChild(info);

  return item;
}

function buildIntentBadgeDOM(intent) {
  var intents = {
    order:     { emoji: '\uD83D\uDED2', label: 'Pedido',      cls: 'wa-intent-order' },
    pricing:   { emoji: '\uD83D\uDCB0', label: 'Cotizacion',  cls: 'wa-intent-pricing' },
    question:  { emoji: '\u2753',        label: 'Pregunta',    cls: 'wa-intent-question' },
    complaint: { emoji: '\u26A0\uFE0F',  label: 'Queja',       cls: 'wa-intent-complaint' },
    greeting:  { emoji: '\uD83D\uDC4B',  label: 'Saludo',      cls: 'wa-intent-greeting' }
  };
  if (!intent || !intents[intent]) return null;
  var i = intents[intent];
  var span = document.createElement('span');
  span.className = 'wa-intent-badge ' + i.cls;
  span.textContent = i.emoji + ' ' + i.label;
  return span;
}

function renderConversationList() {
  waFilterConversations();
  var list = document.getElementById('wa-conv-list');
  if (!list) return;
  buildConversationListDOM(list);
  bindConversationClickEvents();
}

// ==========================================
// RENDERING - CHAT VIEW (DOM)
// ==========================================

function buildChatEmptyDOM(parentEl) {
  var emptyDiv = document.createElement('div');
  emptyDiv.className = 'wa-chat-empty';

  var iconWrap = document.createElement('div');
  iconWrap.className = 'wa-chat-empty-icon';
  var iconEl = document.createElement('i');
  iconEl.setAttribute('data-lucide', 'message-square');
  iconEl.style.cssText = 'width:28px;height:28px;color:#ccc;';
  iconWrap.appendChild(iconEl);
  emptyDiv.appendChild(iconWrap);

  var msgDiv = document.createElement('div');
  msgDiv.style.cssText = 'font-size:15px;font-weight:500;color:#888;';
  msgDiv.textContent = 'Selecciona una conversacion';
  emptyDiv.appendChild(msgDiv);

  var subDiv = document.createElement('div');
  subDiv.style.cssText = 'font-size:13px;color:#bbb;';
  subDiv.textContent = 'Elige una conversacion del panel izquierdo para ver los mensajes';
  emptyDiv.appendChild(subDiv);

  parentEl.appendChild(emptyDiv);
}

function buildChatViewDOM(parentEl) {
  parentEl.textContent = '';

  var conv = waState.conversations.find(function(c) { return c.id === waState.selectedConversationId; });
  if (!conv) {
    var errDiv = document.createElement('div');
    errDiv.className = 'wa-chat-empty';
    var errText = document.createElement('div');
    errText.style.color = '#999';
    errText.textContent = 'Conversacion no encontrada';
    errDiv.appendChild(errText);
    parentEl.appendChild(errDiv);
    return;
  }

  var displayName = conv.client_name || conv.wa_id || 'Desconocido';
  var phone = conv.wa_id || '';

  // --- Header ---
  var header = document.createElement('div');
  header.className = 'wa-chat-header';

  // Back button (mobile)
  var backBtn = document.createElement('button');
  backBtn.className = 'wa-back-btn';
  backBtn.id = 'wa-back-btn';
  backBtn.title = 'Volver';
  var backIcon = document.createElement('i');
  backIcon.setAttribute('data-lucide', 'arrow-left');
  backIcon.style.cssText = 'width:20px;height:20px;';
  backBtn.appendChild(backIcon);
  header.appendChild(backBtn);

  // Avatar
  var avatar = document.createElement('div');
  avatar.className = 'wa-conv-avatar';
  avatar.style.cssText = 'width:40px;height:40px;font-size:14px;';
  avatar.textContent = waGetInitials(displayName);
  header.appendChild(avatar);

  // Header info
  var headerInfo = document.createElement('div');
  headerInfo.className = 'wa-chat-header-info';

  var nameRow = document.createElement('div');
  nameRow.className = 'wa-chat-header-name';
  nameRow.appendChild(document.createTextNode(displayName + ' '));
  if (conv.intent) {
    var badge = buildIntentBadgeDOM(conv.intent);
    if (badge) nameRow.appendChild(badge);
  }
  headerInfo.appendChild(nameRow);

  if (phone) {
    var phoneDiv = document.createElement('div');
    phoneDiv.className = 'wa-chat-header-phone';
    phoneDiv.textContent = '+' + phone;
    headerInfo.appendChild(phoneDiv);
  }

  if (conv.ai_summary) {
    var summaryDiv = document.createElement('div');
    summaryDiv.className = 'wa-chat-header-summary';
    summaryDiv.textContent = conv.ai_summary;
    headerInfo.appendChild(summaryDiv);
  }

  header.appendChild(headerInfo);

  // AI toggle button
  var aiEnabled = conv.ai_enabled !== false; // default true
  var aiToggle = document.createElement('button');
  aiToggle.className = 'wa-ai-toggle ' + (aiEnabled ? 'ai-on' : 'ai-off');
  aiToggle.id = 'wa-ai-toggle';
  aiToggle.title = aiEnabled ? 'AI activada — clic para desactivar' : 'AI desactivada — clic para activar';
  var aiDot = document.createElement('span');
  aiDot.className = 'wa-ai-toggle-dot';
  aiToggle.appendChild(aiDot);
  aiToggle.appendChild(document.createTextNode(aiEnabled ? ' AI ON' : ' AI OFF'));
  header.appendChild(aiToggle);

  // Recap button — AI catches up on missed messages
  var recapBtn = document.createElement('button');
  recapBtn.className = 'wa-recap-btn';
  recapBtn.id = 'wa-recap-btn';
  recapBtn.title = 'AI recapitula mensajes perdidos y responde';
  recapBtn.textContent = '\u21BB Recap';
  header.appendChild(recapBtn);

  // Follow-up button with dropdown
  var followUpWrap = document.createElement('div');
  followUpWrap.style.cssText = 'position:relative;display:inline-block;';

  var followUpBtn = document.createElement('button');
  followUpBtn.className = 'wa-followup-btn';
  followUpBtn.id = 'wa-followup-btn';
  followUpBtn.title = 'Programar follow-up';
  // Show current follow-up state
  if (conv.follow_up_at) {
    var fuD = new Date(conv.follow_up_at);
    var fuNow = new Date();
    if (fuD <= fuNow) {
      followUpBtn.textContent = '\uD83D\uDD14 Vencido';
    } else {
      var fuDiff = Math.ceil((fuD - fuNow) / (1000 * 60 * 60 * 24));
      followUpBtn.textContent = '\u23F1 ' + fuDiff + 'd';
    }
  } else {
    followUpBtn.textContent = '\u23F1 Follow-up';
  }
  followUpWrap.appendChild(followUpBtn);
  header.appendChild(followUpWrap);

  // Insights toggle button (visible on small screens)
  var insightsToggle = document.createElement('button');
  insightsToggle.className = 'wa-insights-toggle' + (waState.insightsVisible ? ' active' : '');
  insightsToggle.id = 'wa-insights-toggle';
  insightsToggle.title = waState.insightsVisible ? 'Ocultar insights' : 'Ver insights';
  insightsToggle.textContent = '\u2728 Insights';
  header.appendChild(insightsToggle);

  // Templates button
  var tplBtn = document.createElement('button');
  tplBtn.textContent = '\uD83D\uDCE8 Plantillas';
  tplBtn.title = 'Gestionar plantillas de WhatsApp';
  tplBtn.style.cssText = 'padding:6px 12px;background:#f39223;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;margin-left:8px;';
  tplBtn.onclick = function() {
    var panel = document.getElementById('wa-templates-panel');
    if (!panel) { panel = buildTemplatesPanel(); }
    panel.style.display = 'block';
    loadTemplates();
  };
  header.appendChild(tplBtn);

  // Media panel button
  var mediaBtn = document.createElement('button');
  mediaBtn.className = 'wa-media-btn';
  mediaBtn.textContent = '\uD83D\uDCCE Media';
  mediaBtn.title = 'Ver fotos, archivos y links';
  mediaBtn.onclick = function() { openMediaPanel(); };
  header.appendChild(mediaBtn);

  parentEl.appendChild(header);

  // --- Messages area ---
  var messagesArea = document.createElement('div');
  messagesArea.className = 'wa-messages-area';
  messagesArea.id = 'wa-messages-area';
  buildMessagesDOM(messagesArea);
  parentEl.appendChild(messagesArea);

  // --- Hidden file input for image uploads ---
  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.id = 'wa-file-input';
  fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp,image/heic';
  fileInput.style.display = 'none';
  parentEl.appendChild(fileInput);

  // --- Image preview strip (shown when image is attached) ---
  var previewStrip = document.createElement('div');
  previewStrip.className = 'wa-img-preview-strip';
  previewStrip.id = 'wa-img-preview-strip';
  previewStrip.style.display = 'none';
  parentEl.appendChild(previewStrip);

  // --- Input area ---
  var inputArea = document.createElement('div');
  inputArea.className = 'wa-input-area';

  var textarea = document.createElement('textarea');
  textarea.className = 'wa-input-field';
  textarea.id = 'wa-input';
  textarea.placeholder = 'Escribe un mensaje...';
  textarea.rows = 1;
  inputArea.appendChild(textarea);

  // Image attach button
  var imgBtn = document.createElement('button');
  imgBtn.className = 'wa-img-btn';
  imgBtn.id = 'wa-img-btn';
  imgBtn.title = 'Adjuntar imagen';
  var imgBtnIcon = document.createElement('i');
  imgBtnIcon.setAttribute('data-lucide', 'image');
  imgBtnIcon.style.cssText = 'width:18px;height:18px;';
  imgBtn.appendChild(imgBtnIcon);
  inputArea.appendChild(imgBtn);

  var sendBtn = document.createElement('button');
  sendBtn.className = 'wa-send-btn';
  sendBtn.id = 'wa-send-btn';
  sendBtn.title = 'Enviar';
  // SVG send icon - build with DOM
  var sendSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  sendSvg.setAttribute('width', '18');
  sendSvg.setAttribute('height', '18');
  sendSvg.setAttribute('viewBox', '0 0 24 24');
  sendSvg.setAttribute('fill', 'none');
  sendSvg.setAttribute('stroke', 'currentColor');
  sendSvg.setAttribute('stroke-width', '2');
  sendSvg.setAttribute('stroke-linecap', 'round');
  sendSvg.setAttribute('stroke-linejoin', 'round');
  var sendLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  sendLine.setAttribute('x1', '22');
  sendLine.setAttribute('y1', '2');
  sendLine.setAttribute('x2', '11');
  sendLine.setAttribute('y2', '13');
  sendSvg.appendChild(sendLine);
  var sendPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
  sendPoly.setAttribute('points', '22 2 15 22 11 13 2 9 22 2');
  sendSvg.appendChild(sendPoly);
  sendBtn.appendChild(sendSvg);
  inputArea.appendChild(sendBtn);

  parentEl.appendChild(inputArea);
}

function buildMessagesDOM(parentEl) {
  parentEl.textContent = '';
  var msgs = waState.messages;

  if (msgs.length === 0) {
    var emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'text-align:center;padding:40px;color:#bbb;font-size:13px;';
    emptyDiv.textContent = 'Sin mensajes';
    parentEl.appendChild(emptyDiv);
    return;
  }

  var lastDate = '';

  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    var msgDate = waFormatDate(m.created_at);

    // Date separator
    if (msgDate !== lastDate) {
      var dateSep = document.createElement('div');
      dateSep.className = 'wa-date-sep';
      dateSep.textContent = msgDate;
      parentEl.appendChild(dateSep);
      lastDate = msgDate;
    }

    // Message bubble
    var msgDiv = document.createElement('div');
    msgDiv.className = 'wa-msg ';

    if (m.direction === 'inbound') {
      msgDiv.className += 'wa-msg-inbound';
    } else if (m.sender === 'ai' || m.sender === 'bot') {
      msgDiv.className += 'wa-msg-ai';
    } else {
      msgDiv.className += 'wa-msg-admin';
    }

    // Sender label
    if (m.direction === 'outbound') {
      var senderDiv = document.createElement('div');
      senderDiv.className = 'wa-msg-sender';
      if (m.sender === 'ai' || m.sender === 'bot') {
        senderDiv.textContent = 'IA AXKAN';
      } else if (m.sender) {
        senderDiv.textContent = m.sender;
      }
      if (senderDiv.textContent) {
        msgDiv.appendChild(senderDiv);
      }
    }

    // Content - render based on message_type
    var contentDiv = document.createElement('div');
    var contentText = m.content || '';
    var msgType = m.message_type || 'text';
    var meta = null;
    if (m.metadata) {
      try {
        meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata || '{}') : (m.metadata || {});
      } catch (e) {
        meta = {};
      }
    } else {
      meta = {};
    }

    if (msgType === 'image' && m.media_url) {
      // Image message
      var img = document.createElement('img');
      img.src = m.media_url;
      img.alt = 'Imagen';
      img.className = 'wa-msg-media-img';
      img.addEventListener('click', (function(url) {
        return function() { window.open(url, '_blank'); };
      })(m.media_url));
      contentDiv.appendChild(img);
      // Show caption below if it exists and isn't the placeholder
      if (contentText && contentText !== '[Imagen]') {
        var captionDiv = document.createElement('div');
        var captionLines = contentText.split('\n');
        for (var j = 0; j < captionLines.length; j++) {
          if (j > 0) captionDiv.appendChild(document.createElement('br'));
          captionDiv.appendChild(document.createTextNode(captionLines[j]));
        }
        contentDiv.appendChild(captionDiv);
      }
    } else if (msgType === 'audio' && m.media_url) {
      // Audio message
      var audio = document.createElement('audio');
      audio.controls = true;
      audio.src = m.media_url;
      audio.className = 'wa-msg-audio';
      contentDiv.appendChild(audio);
      // Show transcription if available
      if (meta && meta.transcription) {
        var transSpan = document.createElement('span');
        transSpan.className = 'wa-msg-transcription';
        transSpan.textContent = meta.transcription;
        contentDiv.appendChild(transSpan);
      }
    } else if (msgType === 'document' && m.media_url) {
      // Document message
      var docLink = document.createElement('a');
      docLink.href = m.media_url;
      docLink.target = '_blank';
      docLink.className = 'wa-msg-doc-link';
      var docFilename = (meta && meta.filename) ? meta.filename : 'Documento';
      docLink.textContent = '\uD83D\uDCC4 ' + docFilename;
      contentDiv.appendChild(docLink);
      // Show caption below if it exists and isn't the placeholder
      if (contentText && !contentText.startsWith('[Documento')) {
        var docCaptionDiv = document.createElement('div');
        var docCaptionLines = contentText.split('\n');
        for (var j = 0; j < docCaptionLines.length; j++) {
          if (j > 0) docCaptionDiv.appendChild(document.createElement('br'));
          docCaptionDiv.appendChild(document.createTextNode(docCaptionLines[j]));
        }
        contentDiv.appendChild(docCaptionDiv);
      }
    } else if (msgType === 'location' || (meta && meta.type === 'location')) {
      // Location message rendering
      var lat = meta.latitude;
      var lng = meta.longitude;
      var locName = meta.name || meta.address || (lat + ', ' + lng);
      var mapUrl = 'https://www.google.com/maps?q=' + lat + ',' + lng;
      var locDiv = document.createElement('div');
      locDiv.style.cssText = 'padding:8px;background:rgba(0,0,0,0.05);border-radius:8px;';
      var locLink = document.createElement('a');
      locLink.href = mapUrl;
      locLink.target = '_blank';
      locLink.style.cssText = 'color:#09adc2;text-decoration:none;font-weight:600;';
      locLink.textContent = '\uD83D\uDCCD ' + locName;
      locDiv.appendChild(locLink);
      contentDiv.appendChild(locDiv);
      if (contentText && contentText !== '[Ubicacion]' && contentText !== '[Location]') {
        var locCaptionDiv = document.createElement('div');
        locCaptionDiv.style.marginTop = '4px';
        locCaptionDiv.textContent = contentText;
        contentDiv.appendChild(locCaptionDiv);
      }
    } else {
      // Text message (default) - render WhatsApp-style formatting
      waRenderRichText(contentDiv, contentText);
    }

    // Flow response rendering
    if (meta && meta.interactive_type === 'nfm_reply' && meta.flow_response) {
      var flowData = meta.flow_response;
      var flowHTML = '<div style="margin-top:6px;padding:8px;background:rgba(0,0,0,0.05);border-radius:8px;">' +
        '<strong>\uD83D\uDCCB Formulario completado:</strong><br>';
      for (var flowKey in flowData) {
        if (flowData.hasOwnProperty(flowKey)) {
          flowHTML += '<span style="color:#666;">' + flowKey + ':</span> ' + flowData[flowKey] + '<br>';
        }
      }
      flowHTML += '</div>';
      contentDiv.innerHTML += flowHTML;
    }

    // Outbound messages: show sent image thumbnails from metadata
    if (m.direction === 'outbound' && meta && meta.imagesSent && Array.isArray(meta.imagesSent)) {
      var thumbsDiv = document.createElement('div');
      thumbsDiv.className = 'wa-msg-thumbnails';
      for (var k = 0; k < meta.imagesSent.length; k++) {
        var thumb = document.createElement('img');
        thumb.src = meta.imagesSent[k];
        thumb.alt = 'Imagen enviada';
        thumb.className = 'wa-msg-thumbnail';
        thumb.addEventListener('click', (function(url) {
          return function() { window.open(url, '_blank'); };
        })(meta.imagesSent[k]));
        thumbsDiv.appendChild(thumb);
      }
      contentDiv.appendChild(thumbsDiv);
    }

    msgDiv.appendChild(contentDiv);

    // Timestamp
    var timeDiv = document.createElement('div');
    timeDiv.className = 'wa-msg-time';
    timeDiv.textContent = waFormatTime(m.created_at);
    msgDiv.appendChild(timeDiv);

    // Reaction picker for inbound messages
    if (m.direction === 'inbound' && m.wa_message_id) {
      var reactBar = document.createElement('div');
      reactBar.className = 'wa-react-bar';
      reactBar.style.cssText = 'display:none;position:absolute;top:-28px;right:8px;background:#fff;border-radius:16px;padding:2px 6px;box-shadow:0 1px 4px rgba(0,0,0,0.15);z-index:10;';
      var emojis = ['\uD83D\uDC4D','\u2764\uFE0F','\u2705','\uD83D\uDE4F','\uD83C\uDF89'];
      emojis.forEach(function(emoji) {
        var btn = document.createElement('span');
        btn.textContent = emoji;
        btn.style.cssText = 'cursor:pointer;padding:2px 4px;font-size:16px;';
        btn.title = 'React with ' + emoji;
        btn.onclick = (function(emojiChar, msgId, btnEl) {
          return async function(e) {
            e.stopPropagation();
            try {
              await fetch('/api/whatsapp/conversations/' + waState.selectedConversationId + '/react', {
                method: 'POST',
                headers: Object.assign({}, getAuthHeaders(), { 'Content-Type': 'application/json' }),
                body: JSON.stringify({ messageId: msgId, emoji: emojiChar })
              });
              btnEl.style.transform = 'scale(1.3)';
              setTimeout(function() { btnEl.style.transform = ''; }, 300);
            } catch (err) {
              console.error('Reaction failed:', err);
            }
          };
        })(emoji, m.wa_message_id, btn);
        reactBar.appendChild(btn);
      });
      msgDiv.style.position = 'relative';
      msgDiv.appendChild(reactBar);
      msgDiv.addEventListener('mouseenter', (function(bar) {
        return function() { bar.style.display = 'flex'; };
      })(reactBar));
      msgDiv.addEventListener('mouseleave', (function(bar) {
        return function() { bar.style.display = 'none'; };
      })(reactBar));
    }

    // Show reaction sent badge
    if (meta && meta.reactionSent) {
      var badge = document.createElement('span');
      badge.textContent = meta.reactionSent;
      badge.style.cssText = 'position:absolute;bottom:-8px;right:8px;font-size:18px;background:#fff;border-radius:50%;padding:1px 3px;box-shadow:0 1px 3px rgba(0,0,0,0.15);';
      msgDiv.style.position = 'relative';
      msgDiv.appendChild(badge);
    }

    parentEl.appendChild(msgDiv);
  }
}

function renderChatMessages() {
  var area = document.getElementById('wa-messages-area');
  if (!area) return;
  var wasAtBottom = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
  buildMessagesDOM(area);
  if (wasAtBottom) {
    area.scrollTop = area.scrollHeight;
  }
}

function renderChatView() {
  var panel = document.getElementById('wa-chat-panel');
  if (!panel) return;
  buildChatViewDOM(panel);
  bindChatEvents();
  if (typeof lucide !== 'undefined') lucide.createIcons();
  scrollChatToBottom();
}

function scrollChatToBottom() {
  var area = document.getElementById('wa-messages-area');
  if (area) {
    area.scrollTop = area.scrollHeight;
  }
}

// ==========================================
// EVENT BINDING
// ==========================================

function bindWhatsAppEvents() {
  // Search input — local filter + server search
  var searchInput = document.getElementById('wa-search');
  var searchTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      waState.searchQuery = this.value;
      waState.searchResults = null;
      // Instant local filter
      waFilterConversations();
      renderConversationList();

      // Debounced server search for deep message search
      clearTimeout(searchTimeout);
      var q = this.value.trim();
      if (q.length >= 2) {
        searchTimeout = setTimeout(function() {
          fetch(API_BASE + '/whatsapp/conversations/search?q=' + encodeURIComponent(q), {
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('admin_token') }
          }).then(function(r) { return r.json(); }).then(function(data) {
            if (data.success && waState.searchQuery.trim() === q) {
              waState.searchResults = data.data;
              waFilterConversations();
              renderConversationList();
            }
          });
        }, 400);
      }
    });
  }

  bindConversationClickEvents();
  bindChatEvents();
  bindInsightsEvents();
}

function bindConversationClickEvents() {
  var items = document.querySelectorAll('.wa-conv-item');
  items.forEach(function(item) {
    item.addEventListener('click', function() {
      var convId = parseInt(this.getAttribute('data-conv-id'), 10);
      if (waState.multiSelect) {
        var idx = waState.selectedConvIds.indexOf(convId);
        if (idx === -1) { waState.selectedConvIds.push(convId); }
        else { waState.selectedConvIds.splice(idx, 1); }
        updateMultiSelectUI();
        return;
      }
      selectConversation(convId);
    });
  });
}

function bindChatEvents() {
  // Back button (mobile)
  var backBtn = document.getElementById('wa-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', function() {
      waState.mobileShowChat = false;
      var layout = document.getElementById('wa-layout');
      if (layout) layout.classList.remove('wa-mobile-chat');
    });
  }

  // Send button
  var sendBtn = document.getElementById('wa-send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendMessage);
  }

  // Image attach button — opens file picker
  var imgBtn = document.getElementById('wa-img-btn');
  var fileInput = document.getElementById('wa-file-input');
  if (imgBtn && fileInput) {
    imgBtn.addEventListener('click', function() {
      if (waState.pendingImageFile) {
        // Already have an image — clicking again removes it
        clearPendingImage();
      } else {
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', function() {
      var file = fileInput.files[0];
      if (!file) return;

      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        if (typeof window.showToast === 'function') {
          window.showToast('La imagen es muy grande (max 10MB)', 'error');
        }
        fileInput.value = '';
        return;
      }

      waState.pendingImageFile = file;

      // Show preview strip
      var strip = document.getElementById('wa-img-preview-strip');
      if (strip) {
        strip.textContent = '';
        strip.style.display = 'flex';

        var thumb = document.createElement('img');
        thumb.className = 'wa-img-preview-thumb';
        thumb.src = URL.createObjectURL(file);
        strip.appendChild(thumb);

        var info = document.createElement('div');
        info.className = 'wa-img-preview-info';
        var nameDiv = document.createElement('div');
        nameDiv.className = 'wa-img-preview-name';
        nameDiv.textContent = file.name;
        info.appendChild(nameDiv);
        var sizeDiv = document.createElement('div');
        sizeDiv.textContent = (file.size / 1024 < 1024)
          ? Math.round(file.size / 1024) + ' KB'
          : (file.size / 1024 / 1024).toFixed(1) + ' MB';
        info.appendChild(sizeDiv);
        strip.appendChild(info);

        var removeBtn = document.createElement('button');
        removeBtn.className = 'wa-img-remove-btn';
        removeBtn.title = 'Quitar imagen';
        removeBtn.textContent = '\u00D7';
        removeBtn.addEventListener('click', clearPendingImage);
        strip.appendChild(removeBtn);
      }

      // Highlight image button
      imgBtn.style.background = '#e72a88';
      imgBtn.style.color = '#fff';
      imgBtn.style.borderColor = '#e72a88';
      imgBtn.title = 'Imagen adjunta (click para quitar)';

      // Reset file input so same file can be re-selected
      fileInput.value = '';
    });
  }

  // Textarea: auto-grow + Enter to send (Shift+Enter for newline)
  var input = document.getElementById('wa-input');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });

    input.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });

    // Paste image from clipboard (Ctrl+V / Cmd+V)
    input.addEventListener('paste', function(e) {
      var items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          var file = items[i].getAsFile();
          if (file) attachImageFile(file);
          return;
        }
      }
    });
  }

  // Drag and drop images onto the chat area
  var chatPanel = document.getElementById('wa-chat-panel');
  if (chatPanel) {
    chatPanel.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      chatPanel.style.outline = '2px dashed #e72a88';
      chatPanel.style.outlineOffset = '-4px';
    });

    chatPanel.addEventListener('dragleave', function(e) {
      e.preventDefault();
      chatPanel.style.outline = '';
      chatPanel.style.outlineOffset = '';
    });

    chatPanel.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      chatPanel.style.outline = '';
      chatPanel.style.outlineOffset = '';

      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;

      var file = files[0];
      if (file.type.indexOf('image') === -1) return;
      attachImageFile(file);
    });
  }
}

/**
 * Attach an image file from paste or drag-drop (reuses existing preview logic)
 */
function attachImageFile(file) {
  if (file.size > 10 * 1024 * 1024) {
    if (typeof window.showToast === 'function') {
      window.showToast('La imagen es muy grande (max 10MB)', 'error');
    }
    return;
  }

  waState.pendingImageFile = file;

  // Show preview strip
  var strip = document.getElementById('wa-img-preview-strip');
  if (strip) {
    strip.textContent = '';
    strip.style.display = 'flex';

    var thumb = document.createElement('img');
    thumb.className = 'wa-img-preview-thumb';
    thumb.src = URL.createObjectURL(file);
    strip.appendChild(thumb);

    var info = document.createElement('div');
    info.className = 'wa-img-preview-info';
    var nameDiv = document.createElement('div');
    nameDiv.className = 'wa-img-preview-name';
    nameDiv.textContent = file.name || 'Imagen pegada';
    info.appendChild(nameDiv);
    var sizeDiv = document.createElement('div');
    sizeDiv.textContent = (file.size / 1024 < 1024)
      ? Math.round(file.size / 1024) + ' KB'
      : (file.size / 1024 / 1024).toFixed(1) + ' MB';
    info.appendChild(sizeDiv);
    strip.appendChild(info);

    var removeBtn = document.createElement('button');
    removeBtn.className = 'wa-img-remove-btn';
    removeBtn.title = 'Quitar imagen';
    removeBtn.textContent = '\u00D7';
    removeBtn.addEventListener('click', clearPendingImage);
    strip.appendChild(removeBtn);
  }

  // Highlight image button
  var imgBtn = document.getElementById('wa-img-btn');
  if (imgBtn) {
    imgBtn.style.background = '#e72a88';
    imgBtn.style.color = '#fff';
    imgBtn.style.borderColor = '#e72a88';
    imgBtn.title = 'Imagen adjunta (click para quitar)';
  }
}

// ==========================================
// IMAGE UPLOAD HELPERS
// ==========================================

function clearPendingImage() {
  waState.pendingImageFile = null;
  waState.pendingImageUrl = null;
  var strip = document.getElementById('wa-img-preview-strip');
  if (strip) {
    strip.textContent = '';
    strip.style.display = 'none';
  }
  var imgBtn = document.getElementById('wa-img-btn');
  if (imgBtn) {
    imgBtn.style.background = '';
    imgBtn.style.color = '';
    imgBtn.style.borderColor = '';
    imgBtn.title = 'Adjuntar imagen';
  }
}

async function uploadImageToCloudinary(file) {
  var formData = new FormData();
  formData.append('receipt', file);
  formData.append('phone', '0000000000'); // Admin upload — phone validation placeholder

  var res = await fetch(API_BASE + '/client/upload/payment-receipt', {
    method: 'POST',
    body: formData
  });
  var json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al subir imagen');
  return json.url;
}

// ==========================================
// ACTIONS
// ==========================================

async function selectConversation(convId) {
  waState.selectedConversationId = convId;
  waState.mobileShowChat = true;

  // Update active state in list
  var items = document.querySelectorAll('.wa-conv-item');
  items.forEach(function(item) {
    var id = parseInt(item.getAttribute('data-conv-id'), 10);
    if (id === convId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Show mobile chat
  var layout = document.getElementById('wa-layout');
  if (layout) layout.classList.add('wa-mobile-chat');

  // Show loading in chat panel
  var panel = document.getElementById('wa-chat-panel');
  if (panel) {
    panel.textContent = '';
    var loadDiv = document.createElement('div');
    loadDiv.className = 'wa-loading';
    loadDiv.textContent = 'Cargando mensajes...';
    panel.appendChild(loadDiv);
  }

  // Fetch messages
  var ok = await fetchConversationMessages(convId);
  if (ok) {
    renderChatView();
    markConversationRead(convId);

    // Ensure insights panel exists in layout
    if (!document.getElementById('wa-insights-panel')) {
      var layout = document.getElementById('wa-layout');
      if (layout) {
        var insightsPanel = document.createElement('div');
        insightsPanel.className = 'wa-insights-panel wa-insights-visible';
        insightsPanel.id = 'wa-insights-panel';
        buildInsightsPanelDOM(insightsPanel);
        layout.appendChild(insightsPanel);
        bindInsightsEvents();
      }
    }

    // Load insights for this conversation
    waState.insights = null;
    fetchInsights(convId, false);

    // Remove unread badge from list item
    var listItem = document.querySelector('.wa-conv-item[data-conv-id="' + convId + '"]');
    if (listItem) {
      var badge = listItem.querySelector('.wa-unread-count');
      if (badge) badge.remove();
    }
  } else {
    if (panel) {
      panel.textContent = '';
      var errWrap = document.createElement('div');
      errWrap.className = 'wa-chat-empty';
      var errMsg = document.createElement('div');
      errMsg.style.color = '#e74c3c';
      errMsg.textContent = 'Error al cargar mensajes';
      errWrap.appendChild(errMsg);
      panel.appendChild(errWrap);
    }
  }
}

async function handleSendMessage() {
  var input = document.getElementById('wa-input');
  var sendBtn = document.getElementById('wa-send-btn');
  if (!input || !waState.selectedConversationId) return;

  var message = input.value.trim();
  var hasImage = !!waState.pendingImageFile;
  if (!message && !hasImage) return;

  // Disable controls while sending
  input.disabled = true;
  if (sendBtn) sendBtn.disabled = true;

  var imageUrl = null;

  // Upload image to Cloudinary first if attached
  if (waState.pendingImageFile) {
    try {
      waState.uploadingImage = true;
      var strip = document.getElementById('wa-img-preview-strip');
      if (strip) {
        var uploadingDiv = document.createElement('div');
        uploadingDiv.className = 'wa-img-uploading';
        uploadingDiv.id = 'wa-upload-status';
        uploadingDiv.textContent = 'Subiendo imagen...';
        strip.appendChild(uploadingDiv);
      }
      imageUrl = await uploadImageToCloudinary(waState.pendingImageFile);
    } catch (uploadErr) {
      console.error('Image upload error:', uploadErr);
      waState.uploadingImage = false;
      var statusEl = document.getElementById('wa-upload-status');
      if (statusEl) statusEl.remove();
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      if (typeof window.showToast === 'function') {
        window.showToast('Error al subir imagen: ' + uploadErr.message, 'error');
      }
      return;
    }
    waState.uploadingImage = false;
  }

  // Optimistic UI: add the message locally
  var tempMsg = {
    id: 'temp-' + Date.now(),
    direction: 'outbound',
    sender: 'admin',
    message_type: imageUrl ? 'image' : 'text',
    content: message || '',
    media_url: imageUrl || null,
    created_at: new Date().toISOString()
  };
  waState.messages.push(tempMsg);
  renderChatMessages();
  scrollChatToBottom();

  // Clear input and reset image state
  input.value = '';
  input.style.height = 'auto';
  clearPendingImage();

  // Send to API
  var success = await sendReply(waState.selectedConversationId, message || '', imageUrl);

  // Re-enable controls
  input.disabled = false;
  if (sendBtn) sendBtn.disabled = false;
  input.focus();

  if (!success) {
    // Remove the temp message on failure
    waState.messages = waState.messages.filter(function(m) { return m.id !== tempMsg.id; });
    renderChatMessages();
    if (typeof window.showToast === 'function') {
      window.showToast('Error al enviar mensaje', 'error');
    }
  } else {
    // Refresh messages from server for accurate data
    var ok = await fetchConversationMessages(waState.selectedConversationId);
    if (ok) renderChatMessages();
    scrollChatToBottom();
  }
}

// ==========================================
// INSIGHTS PANEL
// ==========================================

function buildInsightsPanelDOM(parentEl) {
  parentEl.textContent = '';

  // Header
  var header = document.createElement('div');
  header.className = 'wa-insights-header';

  var title = document.createElement('div');
  title.className = 'wa-insights-title';
  title.textContent = '\u2728 Insights';
  header.appendChild(title);

  var refreshBtn = document.createElement('button');
  refreshBtn.className = 'wa-insights-refresh-btn';
  refreshBtn.id = 'wa-insights-refresh';
  refreshBtn.title = 'Re-analizar conversacion';
  if (waState.insightsLoading) refreshBtn.classList.add('loading');
  refreshBtn.textContent = waState.insightsLoading ? '\u23f3 Analizando...' : '\u21bb Refresh';
  header.appendChild(refreshBtn);

  parentEl.appendChild(header);

  // Content area
  var content = document.createElement('div');
  content.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow-y:auto;';

  if (waState.insightsLoading) {
    var loadingDiv = document.createElement('div');
    loadingDiv.className = 'wa-insights-loading';
    var spinner = document.createElement('div');
    spinner.className = 'wa-insights-loading-spinner';
    loadingDiv.appendChild(spinner);
    var loadingText = document.createElement('div');
    loadingText.style.fontSize = '13px';
    loadingText.textContent = 'Analizando conversacion...';
    loadingDiv.appendChild(loadingText);
    var loadingSubtext = document.createElement('div');
    loadingSubtext.style.cssText = 'font-size:11px;color:#ccc;margin-top:4px;';
    loadingSubtext.textContent = 'Esto puede tomar unos segundos';
    loadingDiv.appendChild(loadingSubtext);
    content.appendChild(loadingDiv);
  } else if (waState.insights && waState.insights.length > 0) {
    var list = document.createElement('div');
    list.className = 'wa-insights-list';

    for (var i = 0; i < waState.insights.length; i++) {
      var insight = waState.insights[i];
      var item = document.createElement('div');
      item.className = 'wa-insight-item wa-insight-' + (insight.priority || 'medium');
      item.style.animationDelay = (i * 0.05) + 's';

      var icon = document.createElement('div');
      icon.className = 'wa-insight-icon';
      icon.textContent = insight.icon || '\u2728';
      item.appendChild(icon);

      var text = document.createElement('div');
      text.className = 'wa-insight-text';
      text.textContent = insight.text || '';
      item.appendChild(text);

      list.appendChild(item);
    }

    content.appendChild(list);

    // "Generar Diseño" button — extracts context from insights and opens prompt app
    var designBtn = document.createElement('button');
    designBtn.style.cssText = 'margin:12px 16px;padding:10px 16px;background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;justify-content:center;transition:all 0.15s;';
    designBtn.textContent = '\uD83C\uDFA8 Generar Diseno';
    designBtn.addEventListener('mouseenter', function() { designBtn.style.transform = 'scale(1.02)'; });
    designBtn.addEventListener('mouseleave', function() { designBtn.style.transform = 'scale(1)'; });
    designBtn.addEventListener('click', function() {
      // Extract design context from insights + conversation
      var destination = '';
      var theme = '';
      var quantity = '';
      var clientName = '';
      var productType = 'magnet';

      if (waState.insights) {
        waState.insights.forEach(function(ins) {
          var t = (ins.text || '').toLowerCase();
          if (ins.category === 'nombre') clientName = ins.text;
          if (ins.category === 'envio' || t.match(/envi|destino|ciudad/)) {
            destination = ins.text.replace(/^envio a\s*/i, '').replace(/^envi.*?:\s*/i, '');
          }
          if (ins.category === 'pedido') {
            var qMatch = ins.text.match(/(\d+)\s*(imanes|llaveros|destapadores|botones)/i);
            if (qMatch) { quantity = qMatch[1]; }
            if (t.includes('llavero')) productType = 'keychain';
            if (t.includes('destapador')) productType = 'opener';
          }
          if (ins.category === 'disenos' || t.match(/dise/)) {
            theme = ins.text;
          }
        });
      }

      // Also check conversation messages for design context
      if (!destination || !theme) {
        var msgs = waState.messages || [];
        for (var m = msgs.length - 1; m >= 0; m--) {
          var msg = msgs[m];
          if (msg.direction !== 'inbound') continue;
          var txt = (msg.content || '').toLowerCase();
          if (!destination && txt.match(/de\s+([\w\s]+?)(?:\s*,|\s*$)/)) {
            var destMatch = txt.match(/(?:de|para|desde)\s+([A-Z][\w\s,]+)/i);
            if (destMatch) destination = destMatch[1].trim();
          }
          if (!theme && txt.match(/mariposa|guelaguetza|iglesia|playa|piramide|catedral|monte alban|cafe|mezcal|talavera/i)) {
            theme = msg.content;
          }
        }
      }

      // Extract design themes/keys from conversation messages
      var designKeys = [];
      var designDetails = [];
      var msgs = waState.messages || [];
      for (var m = 0; m < msgs.length; m++) {
        if (msgs[m].direction !== 'inbound') continue;
        var txt = msgs[m].content || '';
        // Look for design descriptions
        if (txt.match(/mariposa|iglesia|catedral|piramide|playa|monte|cafe|mezcal|talavera|guelaguetza|mercado|comida|artesania|folklore|danza|mole|chocolate|barro|alebrije|cascada|cenote|ruina|templo|volcan|laguna|rio|sierra|selva|desierto/i)) {
          designDetails.push(txt);
        }
      }

      // Calculate variations based on quantity
      var numVariations = 1;
      var qNum = parseInt(quantity) || 0;
      if (qNum >= 1000) numVariations = 10;
      else if (qNum >= 500) numVariations = 5;
      else if (qNum >= 200) numVariations = 3;

      // Determine crazymeter (conservative for business, creative for events)
      var crazymeter = 5;
      var isEvent = false;
      msgs.forEach(function(msg) {
        var t = (msg.content || '').toLowerCase();
        if (t.match(/boda|xv|bautizo|quincea|fiesta|cumple/)) { isEvent = true; crazymeter = 6; }
        if (t.match(/tienda|negocio|vend|comerci/)) { crazymeter = 4; }
      });

      // Build URL params — ALL fields
      var params = new URLSearchParams();
      if (destination) params.set('destination', destination);
      if (theme) params.set('theme', theme);
      if (quantity) params.set('quantity', quantity);
      if (clientName) params.set('client', clientName);
      if (productType) params.set('product', productType);
      params.set('variations', String(numVariations));
      params.set('crazymeter', String(crazymeter));
      params.set('level', isEvent ? '6' : '5');
      params.set('decoration', '8');
      params.set('ratio', 'square');

      // Build keys from design details
      if (destination) {
        params.set('keys', destination);
      }

      // Build instructions from full conversation context
      var conv = waState.conversations.find(function(c) { return c.id === waState.selectedConversationId; });
      var instructions = 'Diseno para ' + (clientName || 'cliente');
      if (destination) instructions += ' de ' + destination;
      if (theme) instructions += '. Tema: ' + theme;
      if (designDetails.length > 0) instructions += '. Detalles del cliente: ' + designDetails.join('; ');
      params.set('instructions', instructions);

      var url = 'http://localhost:3001?' + params.toString();
      window.open(url, '_blank');
    });
    content.appendChild(designBtn);

  } else {
    var emptyDiv = document.createElement('div');
    emptyDiv.className = 'wa-insights-empty';
    emptyDiv.textContent = 'Selecciona una conversacion para ver insights';
    content.appendChild(emptyDiv);
  }

  parentEl.appendChild(content);
}

function renderInsightsPanel() {
  var panel = document.getElementById('wa-insights-panel');
  if (!panel) return;
  buildInsightsPanelDOM(panel);
  bindInsightsEvents();
}

async function toggleAiEnabled(conversationId, enabled) {
  try {
    var res = await fetch(API_BASE + '/whatsapp/conversations/' + conversationId + '/settings', {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ ai_enabled: enabled })
    });
    var data = await res.json();
    if (data.success) {
      // Update local state
      var conv = waState.conversations.find(function(c) { return c.id === conversationId; });
      if (conv) conv.ai_enabled = enabled;
      // Re-render chat panel and conversation list to reflect change
      renderWhatsApp();
    }
  } catch (err) {
    console.error('Failed to toggle AI:', err);
  }
}

async function fetchInsights(conversationId, forceRefresh) {
  waState.insightsLoading = true;
  waState.insights = null;
  renderInsightsPanel();

  try {
    var res = await fetch(API_BASE + '/whatsapp/conversations/' + conversationId + '/insights', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ forceRefresh: !!forceRefresh })
    });
    var json = await res.json();

    if (json.success && json.data) {
      // data may be {insights: [...]} or directly [...]
      waState.insights = json.data.insights || json.data;
    } else {
      waState.insights = null;
    }
  } catch (err) {
    console.error('Error fetching insights:', err);
    waState.insights = null;
  }

  waState.insightsLoading = false;
  renderInsightsPanel();
}

function bindInsightsEvents() {
  var refreshBtn = document.getElementById('wa-insights-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      if (waState.selectedConversationId && !waState.insightsLoading) {
        fetchInsights(waState.selectedConversationId, true);
      }
    });
  }

  var toggleBtn = document.getElementById('wa-insights-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      waState.insightsVisible = !waState.insightsVisible;
      var panel = document.getElementById('wa-insights-panel');
      if (panel) {
        panel.classList.toggle('wa-insights-visible', waState.insightsVisible);
      }
    });
  }

  // AI toggle button
  var aiToggleBtn = document.getElementById('wa-ai-toggle');
  if (aiToggleBtn) {
    aiToggleBtn.addEventListener('click', function() {
      var conv = waState.conversations.find(function(c) { return c.id === waState.selectedConversationId; });
      if (!conv) return;
      var currentlyEnabled = conv.ai_enabled !== false;
      toggleAiEnabled(waState.selectedConversationId, !currentlyEnabled);
    });
  }

  // Recap button
  var recapBtn = document.getElementById('wa-recap-btn');
  if (recapBtn) {
    recapBtn.addEventListener('click', async function() {
      if (!waState.selectedConversationId) return;
      recapBtn.disabled = true;
      recapBtn.textContent = '\u231B Recapitulando...';
      try {
        var res = await fetch(API_BASE + '/whatsapp/conversations/' + waState.selectedConversationId + '/recap', {
          method: 'POST',
          headers: getAuthHeaders()
        });
        var data = await res.json();
        if (data.success) {
          recapBtn.textContent = '\u2705 Enviado';
          setTimeout(function() { recapBtn.textContent = '\u21BB Recap'; recapBtn.disabled = false; }, 2000);
          // Reload messages to show the new AI response
          loadMessages(waState.selectedConversationId);
        } else {
          recapBtn.textContent = '\u274C Error';
          setTimeout(function() { recapBtn.textContent = '\u21BB Recap'; recapBtn.disabled = false; }, 2000);
        }
      } catch (e) {
        recapBtn.textContent = '\u274C Error';
        setTimeout(function() { recapBtn.textContent = '\u21BB Recap'; recapBtn.disabled = false; }, 2000);
      }
    });
  }

  // Follow-up button — dropdown to set follow-up timer
  var followUpBtn = document.getElementById('wa-followup-btn');
  if (followUpBtn) {
    followUpBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Toggle dropdown
      var existing = document.getElementById('wa-followup-dropdown');
      if (existing) {
        existing.remove();
        return;
      }
      var dropdown = document.createElement('div');
      dropdown.className = 'wa-followup-dropdown';
      dropdown.id = 'wa-followup-dropdown';

      var options = [
        { label: '7 dias', days: 7 },
        { label: '14 dias', days: 14 },
        { label: '21 dias', days: 21 },
        { label: '30 dias', days: 30 }
      ];

      options.forEach(function(opt) {
        var btn = document.createElement('button');
        btn.className = 'wa-followup-dropdown-item';
        btn.textContent = '\u23F1 ' + opt.label;
        btn.addEventListener('click', function() {
          setFollowUp(waState.selectedConversationId, { days: opt.days });
          dropdown.remove();
        });
        dropdown.appendChild(btn);
      });

      // Clear option
      var clearBtn = document.createElement('button');
      clearBtn.className = 'wa-followup-dropdown-item danger';
      clearBtn.textContent = '\u2716 Quitar';
      clearBtn.addEventListener('click', function() {
        setFollowUp(waState.selectedConversationId, { clear: true });
        dropdown.remove();
      });
      dropdown.appendChild(clearBtn);

      followUpBtn.parentElement.appendChild(dropdown);

      // Close on outside click
      function closeDropdown(ev) {
        if (!dropdown.contains(ev.target) && ev.target !== followUpBtn) {
          dropdown.remove();
          document.removeEventListener('click', closeDropdown);
        }
      }
      setTimeout(function() {
        document.addEventListener('click', closeDropdown);
      }, 0);
    });
  }
}

async function setFollowUp(conversationId, body) {
  try {
    var res = await fetch(API_BASE + '/whatsapp/conversations/' + conversationId + '/follow-up', {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (data.success) {
      // Update local state
      var conv = waState.conversations.find(function(c) { return c.id === conversationId; });
      if (conv) {
        conv.follow_up_at = data.data.follow_up_at;
      }
      // Re-render
      renderConversationList();
      if (waState.selectedConversationId === conversationId) {
        loadMessages(conversationId);
      }
      if (typeof window.showToast === 'function') {
        window.showToast(body.clear ? 'Follow-up eliminado' : 'Follow-up programado', 'success');
      }
    } else {
      if (typeof window.showToast === 'function') {
        window.showToast('Error: ' + (data.error || 'No se pudo actualizar'), 'error');
      }
    }
  } catch (e) {
    console.error('Follow-up error:', e);
    if (typeof window.showToast === 'function') {
      window.showToast('Error de conexion', 'error');
    }
  }
}

// ==========================================
// MEDIA PANEL (Photos, Files, Links)
// ==========================================

function buildMediaEmpty(iconText, labelText) {
  var wrapper = document.createElement('div');
  wrapper.className = 'wa-media-empty';
  var icon = document.createElement('div');
  icon.className = 'wa-media-empty-icon';
  icon.textContent = iconText;
  wrapper.appendChild(icon);
  wrapper.appendChild(document.createTextNode(labelText));
  return wrapper;
}

function openMediaPanel() {
  var existing = document.getElementById('wa-media-panel-overlay');
  if (existing) existing.remove();

  var messages = waState.messages || [];
  var photos = [];
  var files = [];
  var links = [];
  var urlRegex = /(https?:\/\/[^\s<>"']+)/gi;

  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    var meta = null;
    if (m.metadata) {
      try { meta = typeof m.metadata === 'string' ? JSON.parse(m.metadata) : m.metadata; }
      catch(e) { meta = {}; }
    } else { meta = {}; }

    var msgDate = m.created_at ? new Date(m.created_at) : null;
    var dateStr = msgDate ? msgDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '';

    if (m.message_type === 'image' && m.media_url) {
      photos.push({ url: m.media_url, date: dateStr, caption: m.content || '' });
    }

    if (m.message_type === 'document' && m.media_url) {
      var fname = (meta && meta.filename) ? meta.filename : 'Documento';
      files.push({ url: m.media_url, name: fname, date: dateStr, sender: m.sender || '' });
    }
    if (m.media_url && m.media_url.match(/\.(pdf|doc|docx|xls|xlsx)(\?|$)/i)) {
      var alreadyInFiles = files.some(function(f) { return f.url === m.media_url; });
      if (!alreadyInFiles) {
        var urlParts = m.media_url.split('/');
        var guessName = decodeURIComponent(urlParts[urlParts.length - 1].split('?')[0]);
        files.push({ url: m.media_url, name: guessName, date: dateStr, sender: m.sender || '' });
      }
    }

    if (m.content) {
      var foundUrls = m.content.match(urlRegex);
      if (foundUrls) {
        for (var j = 0; j < foundUrls.length; j++) {
          if (foundUrls[j] === m.media_url) continue;
          var contextText = m.content.substring(0, 80);
          links.push({ url: foundUrls[j], context: contextText, date: dateStr, sender: m.sender || '' });
        }
      }
    }
  }

  var overlay = document.createElement('div');
  overlay.className = 'wa-media-panel-overlay';
  overlay.id = 'wa-media-panel-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  var panel = document.createElement('div');
  panel.className = 'wa-media-panel';
  panel.onclick = function(e) { e.stopPropagation(); };

  var panelHeader = document.createElement('div');
  panelHeader.className = 'wa-media-panel-header';
  var h3 = document.createElement('h3');
  h3.textContent = 'Media, archivos y links';
  panelHeader.appendChild(h3);
  var closeBtn = document.createElement('button');
  closeBtn.className = 'wa-media-close-btn';
  closeBtn.textContent = '\u2715';
  closeBtn.onclick = function() { overlay.remove(); };
  panelHeader.appendChild(closeBtn);
  panel.appendChild(panelHeader);

  var tabsContainer = document.createElement('div');
  tabsContainer.className = 'wa-media-tabs';

  var contentArea = document.createElement('div');
  contentArea.className = 'wa-media-content';

  var tabDefs = [
    { id: 'photos', label: 'Fotos', count: photos.length },
    { id: 'files', label: 'Archivos', count: files.length },
    { id: 'links', label: 'Links', count: links.length }
  ];

  function renderTab(tabId) {
    contentArea.textContent = '';
    var allTabs = tabsContainer.querySelectorAll('.wa-media-tab');
    for (var t = 0; t < allTabs.length; t++) {
      allTabs[t].classList.toggle('active', allTabs[t].dataset.tab === tabId);
    }

    if (tabId === 'photos') {
      if (photos.length === 0) { contentArea.appendChild(buildMediaEmpty('\uD83D\uDDBC\uFE0F', 'No hay fotos')); return; }
      var grid = document.createElement('div');
      grid.className = 'wa-media-grid';
      for (var p = photos.length - 1; p >= 0; p--) {
        (function(photo) {
          var item = document.createElement('div');
          item.className = 'wa-media-grid-item';
          var img = document.createElement('img');
          img.src = photo.url;
          img.alt = photo.caption || 'Foto';
          img.loading = 'lazy';
          item.appendChild(img);
          if (photo.date) {
            var dateLabel = document.createElement('div');
            dateLabel.className = 'wa-media-date';
            dateLabel.textContent = photo.date;
            item.appendChild(dateLabel);
          }
          item.onclick = function() { window.open(photo.url, '_blank'); };
          grid.appendChild(item);
        })(photos[p]);
      }
      contentArea.appendChild(grid);

    } else if (tabId === 'files') {
      if (files.length === 0) { contentArea.appendChild(buildMediaEmpty('\uD83D\uDCC1', 'No hay archivos')); return; }
      for (var f = files.length - 1; f >= 0; f--) {
        (function(file) {
          var item = document.createElement('a');
          item.className = 'wa-media-file-item';
          item.href = file.url;
          item.target = '_blank';
          var ext = file.name.split('.').pop().toLowerCase();
          var iconClass = 'other';
          var iconEmoji = '\uD83D\uDCC4';
          if (ext === 'pdf') { iconClass = 'pdf'; iconEmoji = '\uD83D\uDCC4'; }
          else if (['jpg','jpeg','png','gif','webp'].indexOf(ext) >= 0) { iconClass = 'img'; iconEmoji = '\uD83D\uDDBC\uFE0F'; }
          else if (['doc','docx'].indexOf(ext) >= 0) { iconClass = 'doc'; iconEmoji = '\uD83D\uDCC3'; }
          var iconDiv = document.createElement('div');
          iconDiv.className = 'wa-media-file-icon ' + iconClass;
          iconDiv.textContent = iconEmoji;
          item.appendChild(iconDiv);
          var info = document.createElement('div');
          info.className = 'wa-media-file-info';
          var nameDiv = document.createElement('div');
          nameDiv.className = 'wa-media-file-name';
          nameDiv.textContent = file.name;
          info.appendChild(nameDiv);
          var metaDiv = document.createElement('div');
          metaDiv.className = 'wa-media-file-meta';
          metaDiv.textContent = file.date + (file.sender ? ' \u2022 ' + file.sender : '');
          info.appendChild(metaDiv);
          item.appendChild(info);
          contentArea.appendChild(item);
        })(files[f]);
      }

    } else if (tabId === 'links') {
      if (links.length === 0) { contentArea.appendChild(buildMediaEmpty('\uD83D\uDD17', 'No hay links')); return; }
      for (var l = links.length - 1; l >= 0; l--) {
        (function(link) {
          var item = document.createElement('a');
          item.className = 'wa-media-link-item';
          item.href = link.url;
          item.target = '_blank';
          var urlDiv = document.createElement('div');
          urlDiv.className = 'wa-media-link-url';
          urlDiv.textContent = link.url;
          item.appendChild(urlDiv);
          var ctxDiv = document.createElement('div');
          ctxDiv.className = 'wa-media-link-context';
          ctxDiv.textContent = link.date + (link.context ? ' \u2022 ' + link.context : '');
          item.appendChild(ctxDiv);
          contentArea.appendChild(item);
        })(links[l]);
      }
    }
  }

  for (var t = 0; t < tabDefs.length; t++) {
    (function(tab, idx) {
      var tabBtn = document.createElement('button');
      tabBtn.className = 'wa-media-tab' + (idx === 0 ? ' active' : '');
      tabBtn.dataset.tab = tab.id;
      var labelSpan = document.createTextNode(tab.label + ' ');
      tabBtn.appendChild(labelSpan);
      var countSpan = document.createElement('span');
      countSpan.className = 'wa-media-tab-count';
      countSpan.textContent = tab.count;
      tabBtn.appendChild(countSpan);
      tabBtn.onclick = function() { renderTab(tab.id); };
      tabsContainer.appendChild(tabBtn);
    })(tabDefs[t], t);
  }

  panel.appendChild(tabsContainer);
  panel.appendChild(contentArea);
  overlay.appendChild(panel);
  renderTab('photos');

  var chatPanel = document.querySelector('.wa-chat-panel');
  if (chatPanel) {
    chatPanel.style.position = 'relative';
    chatPanel.appendChild(overlay);
  } else {
    document.body.appendChild(overlay);
  }
}

// ==========================================
// TEMPLATES MANAGEMENT PANEL
// ==========================================

function buildTemplatesPanel() {
  var panel = document.createElement('div');
  panel.id = 'wa-templates-panel';
  panel.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:1000;';

  var modal = document.createElement('div');
  modal.style.cssText = 'background:#fff;max-width:700px;margin:40px auto;border-radius:12px;padding:24px;max-height:calc(100vh - 80px);overflow-y:auto;';

  // Build modal header
  var modalHeader = document.createElement('div');
  modalHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;';
  var modalTitle = document.createElement('h2');
  modalTitle.style.cssText = 'margin:0;font-size:18px;';
  modalTitle.textContent = '\uD83D\uDCE8 Plantillas de WhatsApp';
  modalHeader.appendChild(modalTitle);
  var closeBtn = document.createElement('button');
  closeBtn.id = 'wa-tpl-close';
  closeBtn.style.cssText = 'background:none;border:none;font-size:24px;cursor:pointer;';
  closeBtn.textContent = '\u2715';
  modalHeader.appendChild(closeBtn);
  modal.appendChild(modalHeader);

  // Template list area
  var tplList = document.createElement('div');
  tplList.id = 'wa-tpl-list';
  tplList.style.marginBottom = '24px';
  var loadingP = document.createElement('p');
  loadingP.style.color = '#999';
  loadingP.textContent = 'Cargando plantillas...';
  tplList.appendChild(loadingP);
  modal.appendChild(tplList);

  // Divider
  var hr1 = document.createElement('hr');
  hr1.style.cssText = 'border:none;border-top:1px solid #eee;margin:16px 0;';
  modal.appendChild(hr1);

  // Send template section
  var sendTitle = document.createElement('h3');
  sendTitle.style.cssText = 'font-size:15px;margin-bottom:12px;';
  sendTitle.textContent = 'Enviar plantilla';
  modal.appendChild(sendTitle);

  var sendGrid = document.createElement('div');
  sendGrid.style.cssText = 'display:grid;gap:10px;';

  var tplSelect = document.createElement('select');
  tplSelect.id = 'wa-tpl-select';
  tplSelect.style.cssText = 'padding:8px;border:1px solid #ddd;border-radius:6px;';
  sendGrid.appendChild(tplSelect);

  var tplTo = document.createElement('input');
  tplTo.id = 'wa-tpl-to';
  tplTo.type = 'text';
  tplTo.placeholder = 'N\u00famero (ej: 5215512345678)';
  tplTo.style.cssText = 'padding:8px;border:1px solid #ddd;border-radius:6px;';
  sendGrid.appendChild(tplTo);

  var tplVars = document.createElement('div');
  tplVars.id = 'wa-tpl-vars';
  sendGrid.appendChild(tplVars);

  var sendBtn = document.createElement('button');
  sendBtn.id = 'wa-tpl-send';
  sendBtn.style.cssText = 'padding:10px;background:#e72a88;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;';
  sendBtn.textContent = 'Enviar';
  sendGrid.appendChild(sendBtn);

  var tplResult = document.createElement('div');
  tplResult.id = 'wa-tpl-result';
  tplResult.style.cssText = 'color:#666;font-size:13px;';
  sendGrid.appendChild(tplResult);

  modal.appendChild(sendGrid);

  // Divider
  var hr2 = document.createElement('hr');
  hr2.style.cssText = 'border:none;border-top:1px solid #eee;margin:16px 0;';
  modal.appendChild(hr2);

  // Broadcasts history
  var bcastTitle = document.createElement('h3');
  bcastTitle.style.cssText = 'font-size:15px;margin-bottom:12px;';
  bcastTitle.textContent = 'Historial de env\u00edos';
  modal.appendChild(bcastTitle);

  var bcastDiv = document.createElement('div');
  bcastDiv.id = 'wa-tpl-broadcasts';
  var bcastLoading = document.createElement('p');
  bcastLoading.style.color = '#999';
  bcastLoading.textContent = 'Cargando...';
  bcastDiv.appendChild(bcastLoading);
  modal.appendChild(bcastDiv);

  panel.appendChild(modal);
  document.body.appendChild(panel);

  // Close button
  closeBtn.onclick = function() { panel.style.display = 'none'; };
  panel.onclick = function(e) { if (e.target === panel) panel.style.display = 'none'; };

  // Load templates
  loadTemplates();

  // Send button
  sendBtn.onclick = sendTemplateFromUI;

  return panel;
}

async function loadTemplates() {
  try {
    var res = await fetch('/api/whatsapp/templates', { headers: getAuthHeaders() });
    var data = await res.json();
    var listEl = document.getElementById('wa-tpl-list');
    var selectEl = document.getElementById('wa-tpl-select');

    if (!listEl || !selectEl) return;

    // Clear existing content
    listEl.textContent = '';
    selectEl.textContent = '';

    if (!data.templates || !data.templates.length) {
      var noTplP = document.createElement('p');
      noTplP.style.color = '#999';
      noTplP.textContent = 'No hay plantillas. ';
      var seedBtn = document.createElement('button');
      seedBtn.id = 'wa-tpl-seed';
      seedBtn.style.cssText = 'color:#e72a88;border:none;background:none;cursor:pointer;text-decoration:underline;';
      seedBtn.textContent = 'Crear plantillas por defecto';
      seedBtn.onclick = async function() {
        await fetch('/api/whatsapp/templates/seed', { method: 'POST', headers: getAuthHeaders() });
        loadTemplates();
      };
      noTplP.appendChild(seedBtn);
      listEl.appendChild(noTplP);
      return;
    }

    // Render template cards
    data.templates.forEach(function(t) {
      var statusColors = { pending: '#f39223', approved: '#8ab73b', rejected: '#e52421' };
      var color = statusColors[(t.status || '').toLowerCase()] || '#999';

      var card = document.createElement('div');
      card.style.cssText = 'padding:8px 12px;border:1px solid #eee;border-radius:8px;margin-bottom:8px;';

      var cardRow = document.createElement('div');
      cardRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
      var nameStrong = document.createElement('strong');
      nameStrong.textContent = t.name;
      cardRow.appendChild(nameStrong);
      var statusBadge = document.createElement('span');
      statusBadge.style.cssText = 'font-size:12px;padding:2px 8px;border-radius:10px;background:' + color + '20;color:' + color + ';';
      statusBadge.textContent = t.status || 'pending';
      cardRow.appendChild(statusBadge);
      card.appendChild(cardRow);

      var bodyP = document.createElement('p');
      bodyP.style.cssText = 'margin:4px 0 0;font-size:13px;color:#666;';
      bodyP.textContent = t.body_text;
      card.appendChild(bodyP);

      listEl.appendChild(card);

      // Add to select dropdown
      var opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name + ' (' + (t.status || 'pending') + ')';
      selectEl.appendChild(opt);
    });

    selectEl.onchange = function() { updateTemplateVarFields(data.templates); };
    updateTemplateVarFields(data.templates);

    // Load broadcasts
    try {
      var bRes = await fetch('/api/whatsapp/broadcasts', { headers: getAuthHeaders() });
      var bData = await bRes.json();
      var bEl = document.getElementById('wa-tpl-broadcasts');
      if (!bEl) return;
      bEl.textContent = '';

      if (bData.broadcasts && bData.broadcasts.length) {
        bData.broadcasts.forEach(function(b) {
          var bRow = document.createElement('div');
          bRow.style.cssText = 'padding:6px;border-bottom:1px solid #f0f0f0;font-size:13px;';
          var bName = document.createElement('strong');
          bName.textContent = b.template_name || '?';
          bRow.appendChild(bName);
          bRow.appendChild(document.createTextNode(' \u2014 ' + b.total_sent + ' enviados \u2014 ' + new Date(b.created_at).toLocaleDateString()));
          bEl.appendChild(bRow);
        });
      } else {
        var noBcast = document.createElement('p');
        noBcast.style.color = '#999';
        noBcast.textContent = 'Sin env\u00edos a\u00fan';
        bEl.appendChild(noBcast);
      }
    } catch (bErr) {
      console.error('Load broadcasts error:', bErr);
    }
  } catch (err) {
    console.error('Load templates error:', err);
  }
}

function updateTemplateVarFields(templates) {
  var selectEl = document.getElementById('wa-tpl-select');
  if (!selectEl) return;
  var name = selectEl.value;
  var tpl = null;
  for (var i = 0; i < templates.length; i++) {
    if (templates[i].name === name) { tpl = templates[i]; break; }
  }
  var varsEl = document.getElementById('wa-tpl-vars');
  if (!varsEl) return;
  varsEl.textContent = '';
  if (!tpl || !tpl.variables || !tpl.variables.length) return;
  tpl.variables.forEach(function(v) {
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.dataset.var = v.name;
    inp.placeholder = v.name + ' (ej: ' + (v.example || '') + ')';
    inp.style.cssText = 'padding:8px;border:1px solid #ddd;border-radius:6px;width:100%;box-sizing:border-box;margin-bottom:6px;';
    varsEl.appendChild(inp);
  });
}

async function sendTemplateFromUI() {
  var selectEl = document.getElementById('wa-tpl-select');
  var toEl = document.getElementById('wa-tpl-to');
  var resultEl = document.getElementById('wa-tpl-result');
  if (!selectEl || !toEl || !resultEl) return;

  var name = selectEl.value;
  var to = toEl.value.trim();
  if (!to) { resultEl.textContent = '\u26A0\uFE0F Ingresa un n\u00famero'; return; }

  var variables = {};
  var varInputs = document.querySelectorAll('#wa-tpl-vars input');
  for (var i = 0; i < varInputs.length; i++) {
    variables[varInputs[i].dataset.var] = varInputs[i].value;
  }

  resultEl.textContent = 'Enviando...';
  try {
    var res = await fetch('/api/whatsapp/templates/' + name + '/send', {
      method: 'POST',
      headers: Object.assign({}, getAuthHeaders(), { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ to: to, variables: variables })
    });
    var data = await res.json();
    resultEl.textContent = data.error ? '\u274C ' + data.error : '\u2705 Enviado correctamente';
  } catch (err) {
    resultEl.textContent = '\u274C Error: ' + err.message;
  }
}

// ==========================================
// EXPOSE GLOBALLY
// ==========================================

window.loadWhatsAppConversations = loadWhatsAppConversations;
window.stopWhatsAppPolling = stopWhatsAppPolling;
