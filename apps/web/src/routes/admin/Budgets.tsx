import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { formatUnits } from '../../features/build-chat/units';
import { adminKeys, adminRequest, invalidateAdmin, useAdminBudget, useAdminSettings } from './api';
import { ConfirmDialog } from './ConfirmDialog';
import type { AdminBudget, AdminMember, AdminSettings } from './types';

export function parseUnits(text: string, microUsdPerUnit: number): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  const microUsd = value * microUsdPerUnit;
  return Number.isFinite(value) && value >= 0 && Number.isSafeInteger(microUsd) ? microUsd : null;
}

export function formatEditableUnits(microUsd: number, microUsdPerUnit: number): string {
  return String(microUsd / microUsdPerUnit);
}

export function Budgets() {
  const settings = useAdminSettings();
  const budget = useAdminBudget();
  if (settings.isPending || budget.isPending) return <p className="admin-state">Loading budgets…</p>;
  if (settings.isError || budget.isError) return <p className="admin-state">Not allowed</p>;
  return <BudgetContent budget={budget.data} settings={settings.data} />;
}

function BudgetContent({ settings, budget }: { settings: AdminSettings; budget: AdminBudget }) {
  const [resetZone, setResetZone] = useState(settings.resetZone);
  const [newSlots, setNewSlots] = useState(String(settings.slots.new_game));
  const [editSlots, setEditSlots] = useState(String(settings.slots.edit));
  const [cap, setCap] = useState(formatEditableUnits(settings.platformCapMicroUsd, settings.microUsdPerUnit));
  const [confirmSettings, setConfirmSettings] = useState(false);
  const saveSettings = useMutation({
    mutationFn: () =>
      adminRequest('/admin/settings', {
        method: 'PATCH',
        json: {
          resetZone,
          platformCapMicroUsd: parseUnits(cap, settings.microUsdPerUnit),
          slots: { new_game: Number(newSlots), edit: Number(editSlots) },
        },
      }),
    onSuccess: () => invalidateAdmin(adminKeys.settings(), adminKeys.budget()),
  });
  const saveAllowance = useMutation({
    mutationFn: ({ userId, dailyMicroUsd }: { userId: string; dailyMicroUsd: number }) =>
      adminRequest(`/admin/allowances/${encodeURIComponent(userId)}`, { method: 'PUT', json: { dailyMicroUsd } }),
    onSuccess: () => invalidateAdmin(adminKeys.members(), adminKeys.budget()),
  });
  const settingsValid =
    parseUnits(cap, settings.microUsdPerUnit) !== null &&
    [newSlots, editSlots].every((value) => Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 8);
  const zones = [settings.resetZone, 'UTC', ...Intl.supportedValuesOf('timeZone')].filter(
    (zone, index, all) => all.indexOf(zone) === index,
  );

  return (
    <section>
      <p className="admin-kicker">Family</p>
      <h2>Budgets</h2>
      <div className="admin-card admin-settings-grid">
        <label>
          Reset zone
          <select value={resetZone} onChange={(event) => setResetZone(event.target.value)}>
            {zones.map((zone) => (
              <option key={zone}>{zone}</option>
            ))}
          </select>
        </label>
        <label>
          Creation slots
          <input max="8" min="0" type="number" value={newSlots} onChange={(event) => setNewSlots(event.target.value)} />
        </label>
        <label>
          Edit slots
          <input
            max="8"
            min="0"
            type="number"
            value={editSlots}
            onChange={(event) => setEditSlots(event.target.value)}
          />
        </label>
        <label>
          Platform cap ({settings.unitLabel})
          <input inputMode="decimal" value={cap} onChange={(event) => setCap(event.target.value)} />
        </label>
        <p>
          In use: {budget.inUse.new_game} creation · {budget.inUse.edit} edit
        </p>
        <p>Resets {new Date(budget.resetsAt).toLocaleString()}</p>
        <button
          className="admin-primary tap-primary"
          disabled={!settingsValid}
          type="button"
          onClick={() => setConfirmSettings(true)}
        >
          Save settings
        </button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Daily allowance</th>
              <th scope="col">Remaining today</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {budget.members.map((member) => (
              <BudgetMemberRow
                key={member.userId}
                member={member}
                settings={settings}
                onSave={(dailyMicroUsd) => saveAllowance.mutate({ userId: member.userId, dailyMicroUsd })}
              />
            ))}
          </tbody>
        </table>
      </div>
      {confirmSettings ? (
        <ConfirmDialog
          title="Save family budget settings?"
          onCancel={() => setConfirmSettings(false)}
          onConfirm={() => {
            setConfirmSettings(false);
            saveSettings.mutate();
          }}
        >
          <p>
            {cap} {settings.unitLabel}
          </p>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function BudgetMemberRow({
  member,
  settings,
  onSave,
}: {
  member: AdminMember;
  settings: AdminSettings;
  onSave(value: number): void;
}) {
  const [value, setValue] = useState(formatEditableUnits(member.dailyMicroUsd, settings.microUsdPerUnit));
  const [confirm, setConfirm] = useState(false);
  const parsed = parseUnits(value, settings.microUsdPerUnit);
  return (
    <tr>
      <td data-label="Member">{member.email}</td>
      <td data-label="Daily allowance">
        <input
          aria-label={`Daily allowance for ${member.email}`}
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </td>
      <td data-label="Remaining today">
        {formatUnits(member.remainingMicroUsd, settings.unitLabel, settings.microUsdPerUnit)}
      </td>
      <td data-label="Actions">
        <button
          className="admin-secondary tap-secondary"
          disabled={parsed === null}
          type="button"
          onClick={() => setConfirm(true)}
        >
          Save
        </button>
        {confirm && parsed !== null ? (
          <ConfirmDialog
            title="Save allowance?"
            onCancel={() => setConfirm(false)}
            onConfirm={() => {
              setConfirm(false);
              onSave(parsed);
            }}
          >
            <p>
              {member.email}: {value} {settings.unitLabel}
            </p>
          </ConfirmDialog>
        ) : null}
      </td>
    </tr>
  );
}
