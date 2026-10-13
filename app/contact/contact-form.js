'use client';

import { useRef, useState } from 'react';
import { useForm, ValidationError } from '@formspree/react';

export default function ContactForm() {
  const [state, submit, reset] = useForm('mkjovaer');
  const [networkError, setNetworkError] = useState('');
  const inFlight = useRef(false);
  const invalid = field => Boolean(state.errors?.getFieldErrors(field).length);

  async function handleSubmit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    inFlight.current = true;
    setNetworkError('');
    try {
      await submit(data);
    } catch {
      reset();
      setNetworkError('Your message could not be sent. Check your connection and try again.');
    } finally {
      inFlight.current = false;
    }
  }

  return <div className="contact-form-wrap">
    <div role="status" aria-live="polite">{state.succeeded && <div className="contact-success"><h2>Thanks for getting in touch</h2><p>Your message has been sent. We can reply to the email address you provided.</p><button type="button" onClick={reset}>Send another message</button></div>}</div>
    {!state.succeeded && <form className="contact-form" action="https://formspree.io/f/mkjovaer" method="POST" onSubmit={handleSubmit} aria-busy={state.submitting} aria-describedby="contact-privacy">
      <label htmlFor="contact-name">Name <span>(optional)</span></label>
      <input id="contact-name" name="name" autoComplete="name" maxLength={120} readOnly={state.submitting} aria-invalid={invalid('name')} aria-describedby="contact-name-error" />
      <div id="contact-name-error"><ValidationError field="name" errors={state.errors} /></div>
      <label htmlFor="contact-email">Email</label>
      <input id="contact-email" type="email" name="email" autoComplete="email" required maxLength={254} readOnly={state.submitting} aria-invalid={invalid('email')} aria-describedby="contact-email-error" />
      <div id="contact-email-error"><ValidationError field="email" errors={state.errors} /></div>
      <label htmlFor="contact-message">Message</label>
      <textarea id="contact-message" name="message" required rows={7} maxLength={10000} readOnly={state.submitting} aria-invalid={invalid('message')} aria-describedby="contact-message-help contact-message-error" />
      <p id="contact-message-help" className="contact-help">For a bug report, include your browser, what happened, and the steps to reproduce it.</p>
      <div id="contact-message-error"><ValidationError field="message" errors={state.errors} /></div>
      <input type="hidden" name="_subject" value="Calendar Builder contact message" />
      <p id="contact-privacy" className="contact-help">Your message and email address are sent through Formspree to the site owner. Please leave out sensitive information. <a href="../privacy-policy/">Privacy Policy</a></p>
      <div role="alert" className="contact-error">{networkError || (state.errors && <><p>We couldn’t send your message. Check the fields below or try again.</p><ValidationError errors={state.errors} /></>)}</div>
      <button type="submit" disabled={state.submitting}>{state.submitting ? 'Sending…' : 'Send message'}</button>
    </form>}
  </div>;
}
