'use client';

import { useId, type FormEvent } from 'react';

import { useSpiceUi } from '../context';
import { Icon } from '../icons';
import { Button, Dialog, Field, Select, Textarea } from '../primitives';
import s from './overlays.module.css';

type FeedbackCategory = 'general' | 'bug' | 'suggestion' | 'other';

const CATEGORY_OPTIONS: ReadonlyArray<{ value: FeedbackCategory; label: string }> = [
  { value: 'general', label: 'General feedback' },
  { value: 'bug', label: 'Bug report' },
  { value: 'suggestion', label: 'Feature suggestion' },
  { value: 'other', label: 'Other' },
];

const STARS = [1, 2, 3, 4, 5] as const;

/** Periodic "enjoying SPICE?" prompt, submitted through the same feedback endpoint as Settings. */
export function FeedbackDialog() {
  const m = useSpiceUi();
  const categoryId = useId();
  const messageId = useId();
  if (!m.showFeedbackPopup) return null;

  const dismissForGood = () => {
    try {
      localStorage.setItem('spice_feedback_prompt_dismissed', 'true');
    } catch {
      // Storage may be unavailable (private mode); dismissing the popup still works.
    }
    m.setShowFeedbackPopup(false);
  };

  const onSubmit = (event: FormEvent) => {
    void m.handleFeedbackSubmit(event).then(() => {
      window.setTimeout(() => m.setShowFeedbackPopup(false), 2000);
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) m.setShowFeedbackPopup(false);
      }}
      title={
        <span className={s.titleWithIcon}>
          <Icon name="messageSquare" size={18} />
          Enjoying SPICE?
        </span>
      }
      description="We'd love to hear your thoughts! Help us improve SPICE by sharing a quick review or suggesting features."
      footer={
        <div className={s.footerSplit}>
          <Button variant="ghost" onClick={dismissForGood}>
            Don&apos;t ask again
          </Button>
          <div className={s.footerGroup}>
            {m.feedbackStatus ? (
              <span className={s.feedbackStatus} data-tone={m.feedbackStatus.includes('successfully') ? 'success' : undefined}>
                {m.feedbackStatus}
              </span>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => m.setShowFeedbackPopup(false)}>
              Maybe later
            </Button>
            <Button type="submit" form="spice-feedback-form" loading={m.isSubmittingFeedback} disabled={!m.feedbackText.trim()}>
              Submit
            </Button>
          </div>
        </div>
      }
    >
      <form id="spice-feedback-form" onSubmit={onSubmit} className={s.stack}>
        <div className={s.formGrid}>
          <Field label="Category" htmlFor={categoryId}>
            <Select
              id={categoryId}
              value={m.feedbackCategory as FeedbackCategory}
              onChange={(value) => m.setFeedbackCategory(value)}
              options={CATEGORY_OPTIONS}
            />
          </Field>
          <Field label="Rating">
            <div className={s.stars} role="radiogroup" aria-label="Rating">
              {STARS.map((star) => (
                <button
                  key={star}
                  type="button"
                  className={s.star}
                  data-on={m.feedbackRating >= star ? 'true' : undefined}
                  role="radio"
                  aria-checked={m.feedbackRating === star}
                  aria-label={`${star} star${star === 1 ? '' : 's'}`}
                  onClick={() => m.setFeedbackRating(star)}
                >
                  <Icon name="star" size={18} filled={m.feedbackRating >= star} />
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Your message" htmlFor={messageId}>
          <Textarea
            id={messageId}
            value={m.feedbackText}
            onChange={(event) => m.setFeedbackText(event.target.value)}
            placeholder="What would you like to share?"
            rows={3}
            maxLength={1000}
            required
          />
          <span className={s.charCount}>{m.feedbackText.length}/1000</span>
        </Field>
      </form>
    </Dialog>
  );
}
