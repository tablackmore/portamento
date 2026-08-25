/** Tiny DOM helpers — all the "framework" this app needs. */

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<{
    className: string;
    text: string;
    html: string;
    title: string;
    type: string;
    value: string;
    placeholder: string;
    href: string;
    target: string;
    disabled: boolean;
    ariaCurrent: string;
    onClick: (e: MouseEvent) => void;
  }> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.className) el.className = props.className;
  if (props.text) el.textContent = props.text;
  if (props.html) el.innerHTML = props.html;
  if (props.title) el.title = props.title;
  if (props.type && 'type' in el) (el as HTMLInputElement).type = props.type;
  if (props.value !== undefined && 'value' in el) (el as HTMLInputElement).value = props.value;
  if (props.placeholder && 'placeholder' in el)
    (el as HTMLInputElement).placeholder = props.placeholder;
  if (props.href && 'href' in el) (el as HTMLAnchorElement).href = props.href;
  if (props.target && 'target' in el) (el as HTMLAnchorElement).target = props.target;
  if (props.disabled !== undefined && 'disabled' in el)
    (el as HTMLButtonElement).disabled = props.disabled;
  if (props.ariaCurrent) el.setAttribute('aria-current', props.ariaCurrent);
  if (props.onClick) el.addEventListener('click', props.onClick as EventListener);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string): void {
  document.querySelector('.toast')?.remove();
  const el = h('div', { className: 'toast', text: message });
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

export function spinner(label: string): HTMLElement {
  return h(
    'div',
    { className: 'row report-row' },
    h('span', { className: 'spin' }),
    h('span', { className: 'meta', text: label }),
  );
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = h('a', { href: url });
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
