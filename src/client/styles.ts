export const CSS_ID = 'dsh-ollama-cloud-provider'

export const CSS = `
:where(.ocl-page, .ocl-panel, .ocl-card, .ocl-foot, .ocl-railButton) {
  --ocl-border: var(--dsw-alias-border-l3);
  --ocl-border-strong: var(--dsw-alias-border-l3);
  --ocl-border-soft: var(--dsw-alias-border-l3);
  --ocl-fill: var(--dsw-alias-settings-card-fill);
  --ocl-fill-soft: var(--dsw-alias-bg-layer-2);
  --ocl-fill-hover: var(--dsw-alias-interactive-bg-hover);
  --ocl-text: var(--dsw-alias-label-primary);
  --ocl-text-secondary: var(--dsw-alias-label-secondary);
  --ocl-text-tertiary: var(--dsw-alias-label-tertiary);
  --ocl-accent: var(--dsw-alias-state-business-primary);
  --ocl-accent-soft: color-mix(in srgb, var(--ocl-accent) 16%, transparent);
  --ocl-accent-border: color-mix(in srgb, var(--ocl-accent) 55%, transparent);
  --ocl-success: var(--dsw-alias-state-success-primary);
  --ocl-success-border: color-mix(in srgb, var(--ocl-success) 50%, transparent);
  --ocl-warning: var(--dsw-alias-state-warning-primary);
  --ocl-warning-border: color-mix(in srgb, var(--ocl-warning) 50%, transparent);
  --ocl-danger: var(--dsw-alias-state-error-primary);
  --ocl-danger-soft: color-mix(in srgb, var(--ocl-danger) 12%, transparent);
  --ocl-danger-border: color-mix(in srgb, var(--ocl-danger) 35%, transparent);
  --ocl-focus: var(--dsw-focus-ring-color, var(--ocl-accent));
}
.ocl-page { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 24px; color: inherit; }
.ocl-head { display: flex; flex-direction: column; gap: 4px; }
.ocl-title { font-size: 18px; font-weight: 650; margin: 0; }
.ocl-hint { font-size: 12px; opacity: 0.72; line-height: 1.5; margin: 0; }
.ocl-card { border: 1px solid var(--ocl-border); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; background: var(--ocl-fill); }
.ocl-card-title { font-size: 13px; font-weight: 650; margin: 0; display: flex; align-items: center; gap: 8px; }
.ocl-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ocl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
.ocl-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ocl-label { font-size: 12px; font-weight: 550; opacity: 0.86; }
.ocl-input, .ocl-select { font: inherit; font-size: 13px; padding: 6px 8px; border-radius: 7px; border: 1px solid var(--ocl-border-strong); background: var(--ocl-fill-soft); color: inherit; min-width: 0; }
.ocl-input:focus, .ocl-select:focus { outline: 2px solid var(--ocl-focus); outline-offset: 1px; }
.ocl-button { font: inherit; font-size: 13px; padding: 6px 11px; border-radius: 7px; border: 1px solid var(--ocl-border-strong); background: var(--ocl-fill-hover); color: inherit; cursor: pointer; }
.ocl-button:hover:not(:disabled) { background: var(--ocl-fill-hover); }
.ocl-button:disabled { opacity: 0.5; cursor: default; }
.ocl-button-primary { border-color: var(--ocl-accent-border); background: var(--ocl-accent-soft); }
.ocl-button-danger { border-color: var(--ocl-danger-border); color: var(--ocl-danger); }
.ocl-badge { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--ocl-border-strong); background: var(--ocl-fill-hover); }
.ocl-badge-ok { border-color: var(--ocl-success-border); color: var(--ocl-success); }
.ocl-badge-warn { border-color: var(--ocl-warning-border); color: var(--ocl-warning); }
.ocl-badge-bad { border-color: var(--ocl-danger-border); color: var(--ocl-danger); }
.ocl-heat-wrap { display: flex; flex-direction: column; gap: 8px; }
.ocl-analytics-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ocl-tabs { display: flex; gap: 4px; }
.ocl-tab { border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--ocl-text-secondary); padding: 4px 11px; font: inherit; font-size: 12px; cursor: pointer; }
.ocl-tab:hover { background: var(--ocl-fill-hover); color: var(--ocl-text); }
.ocl-tab-active { border-color: var(--ocl-border); background: var(--ocl-fill-soft); color: var(--ocl-text); }
.ocl-kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
.ocl-kpi { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding: 10px 12px; border: 1px solid var(--ocl-border); border-radius: var(--dsw-radius-md, 8px); background: var(--ocl-fill); }
.ocl-kpi-value { overflow: hidden; color: var(--ocl-text); font-size: 18px; font-weight: 600; line-height: 24px; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ocl-kpi-label { color: var(--ocl-text-tertiary); font-size: 11px; line-height: 16px; }
.ocl-table-scroll { overflow-x: auto; }
@media (max-width: 720px) { .ocl-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.ocl-heat-scroll { overflow-x: auto; padding-bottom: 4px; }
.ocl-heat { display: grid; grid-template-columns: 32px repeat(24, minmax(12px, 1fr)); gap: 2px; align-items: center; min-width: 600px; }
.ocl-heat-hour { font-size: 9px; color: var(--ocl-text-tertiary); text-align: center; }
.ocl-heat-day { font-size: 10px; color: var(--ocl-text-secondary); }
.ocl-heat-cell { height: 14px; border-radius: 3px; }
.ocl-heat-legend { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--ocl-text-tertiary); }
.ocl-heat-swatch { width: 12px; height: 12px; border-radius: 2px; }
.ocl-hour-strip-head { margin: 10px 0 0; font-size: 10px; color: var(--ocl-text-tertiary); }
.ocl-hour-strip { display: grid; grid-template-columns: 32px repeat(24, minmax(12px, 1fr)); gap: 2px; align-items: end; height: 30px; min-width: 600px; }
.ocl-hour-col { display: flex; align-items: flex-end; height: 100%; }
.ocl-hour-bar { display: block; width: 100%; min-height: 2px; border-radius: 2px 2px 0 0; }
.ocl-hour-labels { display: grid; grid-template-columns: 32px repeat(24, minmax(12px, 1fr)); gap: 2px; font-size: 9px; color: var(--ocl-text-tertiary); text-align: center; min-width: 600px; }
.ocl-bars { display: flex; flex-direction: column; gap: 8px; }
.ocl-bar-row { display: grid; grid-template-columns: 72px 1fr auto; gap: 10px; align-items: center; font-size: 12px; }
.ocl-bar { height: 8px; border-radius: 999px; background: var(--ocl-fill-hover); overflow: hidden; }
.ocl-bar-fill { height: 100%; border-radius: 999px; background: currentColor; opacity: 0.65; }
.ocl-bar-fill-warn { background: var(--ocl-warning); opacity: 1; }
.ocl-bar-fill-bad { background: var(--ocl-danger); opacity: 1; }
.ocl-models { display: flex; flex-direction: column; gap: 6px; max-height: 340px; overflow: auto; padding-right: 4px; }
.ocl-model { display: grid; grid-template-columns: 22px minmax(0,1fr) 120px; gap: 8px; align-items: center; font-size: 12px; padding: 3px 0; }
.ocl-model-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ocl-model-legend { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; color: var(--ocl-text-secondary); font-size: 11px; }
.ocl-model-legend > span { display: inline-flex; align-items: center; gap: 5px; }
.ocl-model-section { display: flex; flex-direction: column; gap: 4px; padding-top: 8px; border-top: 1px solid var(--ocl-border-soft); }
.ocl-model-section:first-child { border-top: 0; padding-top: 0; }
.ocl-model-section-head { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 12px; font-weight: 650; }
.ocl-model-section-head .ocl-badge { padding: 0 6px; font-size: 10px; }
.ocl-model-section .ocl-hint { margin: 0 0 4px; }
.ocl-account { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr) auto; gap: 8px; align-items: center; }
.ocl-account-block { display: flex; flex-direction: column; gap: 6px; padding: 9px; border: 1px solid var(--ocl-border-soft); border-radius: 8px; background: var(--ocl-fill); }
.ocl-notice { font-size: 12px; padding: 7px 10px; border-radius: 7px; background: var(--ocl-accent-soft); border: 1px solid var(--ocl-accent-border); }
.ocl-error { font-size: 12px; padding: 7px 10px; border-radius: 7px; background: var(--ocl-danger-soft); border: 1px solid var(--ocl-danger-border); color: var(--ocl-danger); }
[class*="_footerActions"]:has(.ocl-foot), [class*="_footerActions"]:has(.ocl-railButton) { flex-direction: column; }
.ocl-foot { box-sizing: border-box; flex: 1 1 auto; width: 100%; min-width: 0; display: flex; flex-direction: column; gap: 6px; margin: 0 0 4px; padding: 8px; border: 0.5px solid transparent; border-radius: var(--dsw-radius-md, 8px); background: transparent; color: var(--ocl-text-secondary); font: inherit; text-align: left; cursor: pointer; }
.ocl-foot:hover { color: var(--ocl-text); background: var(--ocl-fill-hover); border-color: var(--ocl-border); }
.ocl-foot:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--ocl-focus); outline-offset: -2px; }
.ocl-footTop { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ocl-footName { min-width: 0; overflow: hidden; color: var(--ocl-text); font-size: 14px; font-weight: 400; line-height: 20px; white-space: nowrap; text-overflow: ellipsis; }
.ocl-footPct { flex: none; width: 34px; margin-left: auto; color: var(--ocl-text-secondary); text-align: right; font-size: 12px; line-height: 16px; font-variant-numeric: tabular-nums; }
.ocl-footPctWarn { color: var(--ocl-warning); }
.ocl-footPctBad { color: var(--ocl-danger); }
.ocl-footRow { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ocl-footHead { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; }
.ocl-footLabel { flex: 1 1 auto; min-width: 0; overflow: hidden; color: var(--ocl-text-tertiary); text-overflow: ellipsis; white-space: nowrap; font-size: 12px; line-height: 16px; }
.ocl-footAmount { flex: 0 0 auto; max-width: 68%; overflow: hidden; color: var(--ocl-text-secondary); text-align: right; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 16px; font-variant-numeric: tabular-nums; }
.ocl-footBar { display: block; height: 4px; border-radius: var(--dsw-radius-xs, 3px); background: var(--ocl-fill-hover); overflow: hidden; }
.ocl-footFill { display: block; height: 100%; border-radius: var(--dsw-radius-xs, 3px); background: var(--ocl-success); transition: width 0.3s ease; }
.ocl-footFillWarn { background: var(--ocl-warning); }
.ocl-footFillBad { background: var(--ocl-danger); }
.ocl-footMessage { color: var(--ocl-text-tertiary); font-size: 11px; line-height: 16px; }
.ocl-railButton { box-sizing: border-box; flex: none; display: inline-flex; justify-content: center; align-items: center; width: 36px; height: 36px; margin: 0 0 4px; padding: 0; border: 0.5px solid transparent; border-radius: var(--dsw-radius-md, 8px); background: transparent; color: var(--ocl-text-secondary); cursor: pointer; }
.ocl-railButton:hover { color: var(--ocl-text); background: var(--ocl-fill-hover); }
.ocl-railButton:focus-visible { outline: var(--dsw-focus-ring-width, 2px) solid var(--ocl-focus); outline-offset: -2px; }
.ocl-ring { flex: none; display: inline-flex; }
.ocl-panel { display: flex; flex-direction: column; gap: 14px; padding: 18px; max-width: 760px; margin: 0 auto; height: 100%; max-height: calc(100vh - 56px); min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.ocl-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ocl-limits { margin-top: 8px; }
.ocl-limits summary { cursor: pointer; font-size: 12px; font-weight: 600; padding: 4px 0; }
.ocl-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ocl-table th, .ocl-table td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--ocl-border-soft); vertical-align: top; }
.ocl-table th { font-weight: 600; opacity: 0.8; }
`
