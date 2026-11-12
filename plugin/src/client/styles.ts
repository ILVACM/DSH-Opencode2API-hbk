export const CARD_CSS = `
.olp-card{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#202126);color:var(--dsw-alias-label-primary,#e6e6e6)}
.olp-tabs{display:flex;gap:8px}
.olp-tab{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:6px 14px;background:transparent;color:var(--dsw-alias-label-secondary,#aaa)}
.olp-tab-active{color:var(--dsw-alias-label-primary,#e6e6e6);border-color:var(--dsw-alias-border-l2,#36373b);background:var(--dsw-alias-bg-layer-2,#25262b)}
.olp-hint{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary,#999)}
.olp-error{margin:0;font-size:13px;color:var(--dsw-alias-state-error-primary,#d92d20)}
.olp-toolbar{display:flex;gap:8px;flex-wrap:wrap}
.olp-row{display:grid;grid-template-columns:24px 1fr 90px;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l2,#2c2d31);font-size:13px}
.olp-row-head{color:var(--dsw-alias-label-tertiary,#999);border-top:0;font-size:12px}
.olp-check{display:flex;align-items:center;justify-content:center}
.olp-model-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.olp-btn{appearance:none;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,#36373b);border-radius:8px;padding:6px 14px;background:transparent;color:inherit;align-self:flex-start}
.olp-btn:disabled{opacity:.4;cursor:default}
.olp-toggle{display:flex;align-items:center;gap:8px;font-size:13px}
.olp-disabled{opacity:.5}
.olp-crash{padding:12px;font-size:13px;color:var(--dsw-alias-state-error-primary,#d92d20)}
`
