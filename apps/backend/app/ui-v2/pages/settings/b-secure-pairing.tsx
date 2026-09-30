'use client';

import { useEffect, useId, useRef, useState } from 'react';

import {
  formatPairingCodeInput,
  normalizePairingCodeInput,
  pairingCodeInputSegments,
} from '../../../spice-client-runtime';
import { Icon } from '../../icons';
import type { SpiceUiModel } from '../../model';
import { Badge, Button, IconButton, Input, SettingsBlock, type BadgeVariant } from '../../primitives';
import s from './b-settings.module.css';

type PairingCodeResult = Awaited<ReturnType<SpiceUiModel['createSecurePairingCode']>>;
type PairedDeviceAuthorization = Awaited<ReturnType<SpiceUiModel['loadSecurePairingAuthorizations']>>[number];

export interface SecurePairingProps {
  accountAvailable: boolean;
  pairedCredentialActive: boolean;
  deviceName: string;
  onCreateCode: () => Promise<PairingCodeResult>;
  onCancelCode: (pairingId: string) => Promise<void>;
  onClaimCode: (code: string, displayName: string) => Promise<void>;
  onLoadAuthorizations: () => Promise<PairedDeviceAuthorization[]>;
  onRevokeAuthorization: (authorizationId: string) => Promise<void>;
  onForgetCredential: () => void;
}

const AUTHORIZATION_BADGE: Record<PairedDeviceAuthorization['status'], BadgeVariant> = {
  active: 'success',
  expired: 'outline',
  revoked: 'danger',
};

/**
 * v2 rebuild of the classic SecurePairingPanel: same props, same local state
 * machine and status copy. Parents key it by profile/account so switching
 * either resets the drafts, exactly like the classic panel.
 */
export function SecurePairing({
  accountAvailable,
  pairedCredentialActive,
  deviceName,
  onCreateCode,
  onCancelCode,
  onClaimCode,
  onLoadAuthorizations,
  onRevokeAuthorization,
  onForgetCredential,
}: SecurePairingProps) {
  const [pairingCode, setPairingCode] = useState<PairingCodeResult | null>(null);
  const [claimCodeFirst, setClaimCodeFirst] = useState('');
  const [claimCodeSecond, setClaimCodeSecond] = useState('');
  const [claimName, setClaimName] = useState(deviceName);
  const [authorizations, setAuthorizations] = useState<PairedDeviceAuthorization[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Pair a phone without sharing your account password.');
  const [codeCopied, setCodeCopied] = useState(false);
  const secondCodeInputRef = useRef<HTMLInputElement>(null);
  const claimCode = `${claimCodeFirst}${claimCodeSecond}`;
  const nameId = useId();
  const codeId = useId();

  useEffect(() => {
    if (!codeCopied) return;
    const timer = window.setTimeout(() => setCodeCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [codeCopied]);

  const applyPastedCode = (value: string) => {
    const segments = pairingCodeInputSegments(value);
    setClaimCodeFirst(segments.first);
    setClaimCodeSecond(segments.second);
    if (segments.first.length === 4) {
      requestAnimationFrame(() => secondCodeInputRef.current?.focus());
    }
  };

  const refreshAuthorizations = async () => {
    if (!accountAvailable) return;
    const next = await onLoadAuthorizations();
    setAuthorizations(next);
  };

  const createCode = async () => {
    setBusy(true);
    try {
      const result = await onCreateCode();
      setPairingCode(result);
      setStatus('Pairing code created. Enter it on the phone within five minutes.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create a pairing code.');
    } finally {
      setBusy(false);
    }
  };

  const cancelCode = async (code: PairingCodeResult) => {
    setBusy(true);
    try {
      await onCancelCode(code.pairingId);
      setPairingCode(null);
      setStatus('Pairing code cancelled.');
    } catch (error) {
      setPairingCode(null);
      setStatus(error instanceof Error ? error.message : 'The pairing code is no longer active.');
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    setBusy(true);
    try {
      await onClaimCode(formatPairingCodeInput(claimCode), claimName);
      setClaimCodeFirst('');
      setClaimCodeSecond('');
      setStatus('This device is paired and can use Spice Connect.');
      await refreshAuthorizations().catch(() => undefined);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Pairing failed.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (authorization: PairedDeviceAuthorization) => {
    setBusy(true);
    try {
      await onRevokeAuthorization(authorization.id);
      await refreshAuthorizations();
      setStatus(`${authorization.displayName} was revoked.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Authorization could not be revoked.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = (code: string) => {
    void navigator.clipboard
      ?.writeText(code)
      .then(() => setCodeCopied(true))
      .catch(() => undefined);
  };

  const credentialLabel = pairedCredentialActive ? 'Paired credential active' : accountAvailable ? 'Account connected' : 'Pairing available';

  return (
    <>
      <SettingsBlock className={s.block}>
        <div className={s.blockHeader}>
          <div className={s.blockHeaderText}>
            <h3 className={s.blockTitle}>Secure pairing</h3>
            <p className={s.blockDescription} role="status" aria-live="polite">
              {status}
            </p>
          </div>
          <Badge variant={pairedCredentialActive || accountAvailable ? 'accent' : 'outline'}>{credentialLabel}</Badge>
        </div>

        <div className={s.split}>
          <section className={s.panel} aria-labelledby={`${codeId}-create`}>
            <div className={s.blockHeaderText}>
              <h4 id={`${codeId}-create`} className={s.blockTitle}>
                Create a phone pairing code
              </h4>
              <p className={s.blockDescription}>Codes expire after five minutes and work only once.</p>
            </div>
            {pairingCode ? (
              <div className={s.pairingCode}>
                <div className={s.pairingCodeText}>
                  <span className={s.pairingCodeValue} aria-label={`Pairing code ${pairingCode.code.split('').join(' ')}`}>
                    {pairingCode.code}
                  </span>
                  <span className={s.pairingCodeExpiry}>Expires {new Date(pairingCode.expiresAt).toLocaleTimeString()}</span>
                </div>
                <IconButton
                  icon={codeCopied ? 'check' : 'copy'}
                  label={codeCopied ? 'Pairing code copied' : 'Copy pairing code'}
                  size="sm"
                  variant="outline"
                  className={s.touch}
                  onClick={() => copyCode(pairingCode.code)}
                />
              </div>
            ) : (
              <div className={s.pairingCode} data-empty="true">
                No active code
              </div>
            )}
            <div className={s.actions}>
              <Button className={s.touch} size="sm" icon="key" disabled={!accountAvailable || busy} onClick={() => void createCode()}>
                Generate code
              </Button>
              {pairingCode ? (
                <Button className={s.touch} size="sm" variant="outline" disabled={busy} onClick={() => void cancelCode(pairingCode)}>
                  Cancel code
                </Button>
              ) : null}
            </div>
            {!accountAvailable ? <p className={s.note}>Sign in on the device that creates the code.</p> : null}
          </section>

          <section className={s.panel} aria-labelledby={`${codeId}-claim`}>
            <div className={s.blockHeaderText}>
              <h4 id={`${codeId}-claim`} className={s.blockTitle}>
                Pair this phone or browser
              </h4>
              <p className={s.blockDescription}>Enter the code shown by the signed-in SPICE device.</p>
            </div>
            <div className={s.fieldStack}>
              <label htmlFor={nameId} className={s.fieldLabel}>
                Device name
              </label>
              <Input id={nameId} value={claimName} maxLength={80} onChange={(event) => setClaimName(event.target.value)} />
            </div>
            <div className={s.fieldStack}>
              <span className={s.fieldLabel} id={`${codeId}-code`}>
                Pairing code
              </span>
              <div
                className={s.codeInput}
                role="group"
                aria-labelledby={`${codeId}-code`}
                onPaste={(event) => {
                  event.preventDefault();
                  applyPastedCode(event.clipboardData.getData('text'));
                }}
              >
                <Input
                  value={claimCodeFirst}
                  maxLength={4}
                  placeholder="ABCD"
                  autoComplete="one-time-code"
                  aria-label="Pairing code first four characters"
                  onChange={(event) => {
                    const next = normalizePairingCodeInput(event.target.value).slice(0, 4);
                    setClaimCodeFirst(next);
                    if (next.length === 4) secondCodeInputRef.current?.focus();
                  }}
                />
                <span className={s.codeDash} aria-hidden="true">
                  -
                </span>
                <Input
                  ref={secondCodeInputRef}
                  value={claimCodeSecond}
                  maxLength={4}
                  placeholder="2345"
                  aria-label="Pairing code last four characters"
                  onChange={(event) => setClaimCodeSecond(normalizePairingCodeInput(event.target.value).slice(0, 4))}
                />
              </div>
            </div>
            <div className={s.actions}>
              <Button className={s.touch} size="sm" icon="link" disabled={busy || claimCode.length !== 8 || !claimName.trim()} onClick={() => void claim()}>
                Pair this device
              </Button>
              {pairedCredentialActive ? (
                <Button className={s.touch} size="sm" variant="ghost" onClick={onForgetCredential}>
                  Forget local credential
                </Button>
              ) : null}
            </div>
          </section>
        </div>
      </SettingsBlock>

      {accountAvailable ? (
        <SettingsBlock className={s.block}>
          <div className={s.blockHeader}>
            <div className={s.blockHeaderText}>
              <h3 className={s.blockTitle}>Authorized paired devices</h3>
              <p className={s.blockDescription}>Phones and browsers that joined with a pairing code.</p>
            </div>
            <Button className={s.touch} size="sm" variant="outline" icon="refresh" disabled={busy} onClick={() => void refreshAuthorizations()}>
              Refresh
            </Button>
          </div>
          {authorizations === null ? (
            <p className={s.note}>Select Refresh to load paired devices.</p>
          ) : authorizations.length === 0 ? (
            <p className={s.note}>No phones have been paired yet.</p>
          ) : (
            <ul className={s.deviceList} aria-label="Authorized paired devices">
              {authorizations.map((authorization) => (
                <li key={authorization.id} className={s.deviceRow}>
                  <span className={s.deviceIcon} data-online={authorization.status === 'active' ? 'true' : undefined} aria-hidden="true">
                    <Icon name="smartphone" size={16} />
                  </span>
                  <span className={s.deviceText}>
                    <span className={s.deviceName}>
                      <span className={s.deviceNameText}>{authorization.displayName}</span>
                    </span>
                    <span className={s.deviceMeta}>Expires {new Date(authorization.expiresAt).toLocaleDateString()}</span>
                  </span>
                  <span className={s.deviceBadges}>
                    <Badge variant={AUTHORIZATION_BADGE[authorization.status] ?? 'outline'}>{authorization.status}</Badge>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className={s.touch}
                    disabled={authorization.status !== 'active' || busy}
                    onClick={() => void revoke(authorization)}
                    aria-label={`Revoke ${authorization.displayName}`}
                  >
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SettingsBlock>
      ) : null}
    </>
  );
}
