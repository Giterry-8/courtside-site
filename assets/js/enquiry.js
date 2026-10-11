// Trade enquiry: prepares a mailto: draft in the visitor's own email app.
// Nothing is sent or stored by this site. Copy and manual fallbacks are always offered.
export const MAILBOX = 'admin@courtsideholdings.com';

export function composeEnquiry({ name, venue, market, message }) {
  const subject = `Courtside trade enquiry — ${venue || name} (${market})`;
  const body = [
    `Name: ${name}`,
    `Club or venue: ${venue || 'Not given'}`,
    `Market: ${market}`,
    '',
    message,
  ].join('\r\n');
  const href = `mailto:${MAILBOX}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const text = `To: ${MAILBOX}\nSubject: ${subject}\n\n${body.replace(/\r\n/g, '\n')}`;
  return { subject, body, href, text };
}

async function copyText(text) {
  if (!navigator.clipboard?.writeText || !window.isSecureContext) throw new Error('Clipboard unavailable');
  await navigator.clipboard.writeText(text);
}

export function initEnquiry() {
  const form = document.querySelector('#enquiry-form');
  if (!form) return;
  const status = form.querySelector('#enquiry-status');
  const error = form.querySelector('#enquiry-error');
  const manual = form.querySelector('#manual-copy');
  const draft = form.querySelector('#enquiry-draft');
  const radios = [...form.querySelectorAll('input[name="market"]')];
  const markMarket = bad => radios.forEach(r => (bad ? r.setAttribute('aria-invalid', 'true') : r.removeAttribute('aria-invalid')));

  // "Enquire from the UK / South Africa" links preselect the market.
  document.querySelectorAll('[data-market]').forEach(link => link.addEventListener('click', () => {
    const radio = form.querySelector(`input[name="market"][value="${link.dataset.market}"]`);
    if (radio) { radio.checked = true; markMarket(false); }
  }));

  const read = () => {
    const data = new FormData(form);
    const value = key => String(data.get(key) || '').trim();
    return { name: value('name'), venue: value('venue'), market: value('market'), message: value('message') };
  };

  function validate() {
    const values = read();
    const problems = [];
    const mark = (el, bad) => (bad ? el.setAttribute('aria-invalid', 'true') : el.removeAttribute('aria-invalid'));
    const nameField = form.querySelector('#f-name');
    const messageField = form.querySelector('#f-message');
    mark(nameField, !values.name);
    markMarket(!values.market);
    mark(messageField, !values.message);
    if (!values.name) problems.push(['your name', nameField]);
    if (!values.market) problems.push(['your market', form.querySelector('input[name="market"]')]);
    if (!values.message) problems.push(['a short message', messageField]);
    if (problems.length) {
      const list = problems.map(([label]) => label);
      const joined = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0];
      error.textContent = `Please add ${joined}.`;
      problems[0][1].focus();
      return null;
    }
    error.textContent = '';
    return values;
  }

  function showManual(text) {
    manual.hidden = false;
    draft.value = text;
    draft.focus();
    draft.select();
  }

  form.addEventListener('input', event => {
    if (event.target.name === 'market') markMarket(false);
    else event.target.removeAttribute('aria-invalid');
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = validate();
    if (!values) return;
    const enquiry = composeEnquiry(values);
    draft.value = enquiry.text;
    window.location.href = enquiry.href;
    status.textContent = `Your email app should now open with this enquiry addressed to ${MAILBOX}. Nothing has been sent yet: review it and press send there. If no draft appeared, `;
    const again = document.createElement('a');
    again.id = 'enquiry-again';
    again.href = enquiry.href;
    again.textContent = 'try opening it again';
    status.append(again, ' or use “Copy enquiry”.');
  });

  form.querySelector('[data-action="copy"]').addEventListener('click', async () => {
    const values = validate();
    if (!values) return;
    const { text } = composeEnquiry(values);
    try {
      await copyText(text);
      manual.hidden = false;
      draft.value = text;
      status.textContent = `Enquiry copied. Paste it into a new email to ${MAILBOX} and send it from there.`;
    } catch {
      showManual(text);
      status.textContent = `Select the text below, copy it, and paste it into an email to ${MAILBOX}.`;
    }
  });

  // Copy address button beside the visible mailbox.
  document.querySelectorAll('[data-copy]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const original = 'Copy address';
      try {
        await copyText(button.dataset.copy);
        button.textContent = 'Copied';
      } catch {
        const address = button.previousElementSibling;
        const range = document.createRange();
        range.selectNodeContents(address);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = 'Selected — press copy';
      }
      setTimeout(() => { button.textContent = original; }, 2600);
    });
  });
}
