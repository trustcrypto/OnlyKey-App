import React from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { DeviceType } from '../api/device/types';
import {
  CLASSIC_SLOT_ROWS,
  DUO_PROFILES,
  DUO_PROFILE_COLUMNS,
  type DuoProfileId,
} from '../api/device/firmwareConstants';
import { TOOLTIPS } from '../data/tooltips';
import { HelpTip } from './ui/HelpTip';

const CLASSIC_DEVICE_IMG_DARK = './images/onlykey-photo.png';
const CLASSIC_DEVICE_IMG_LIGHT = './images/onlykey-photo-light.png';
const DUO_DEVICE_IMG_DARK = './images/duo-photo.jpg';
const DUO_DEVICE_IMG_LIGHT = './images/duo-photo-light.jpg';

/** Shown when the device reports no label for a slot (firmware sends "empty" or omits the slot). */
export const EMPTY_SLOT_LABEL = '<empty>';

const SlotGrid: React.FC = () => {
  const { deviceType, labels, setSelectedSlot, duoProfile, setDuoProfile } = useDeviceStore();
  const isDuo = deviceType === DeviceType.DUO;

  return (
    <div className="slots-content">
      <p className="slots-intro">
        Slots are where you store login information such as a login URL, username, password,
        and two-factor.{' '}
        <HelpTip href={TOOLTIPS.slots.href} tooltip={TOOLTIPS.slots.text} />
      </p>
      <p className="slots-label-note">
        Slots shown as {EMPTY_SLOT_LABEL} have no label set on the device. For security, the app only
        receives slot labels — not URLs, usernames, passwords, or other fields — so {EMPTY_SLOT_LABEL}{' '}
        does not mean a slot is unused.
      </p>
      <hr className="slots-divider" />

      {isDuo ? (
        <DuoSlotLayout
          profile={duoProfile}
          onProfileChange={setDuoProfile}
          labels={labels}
          onSelect={setSelectedSlot}
        />
      ) : (
        <ClassicSlotLayout labels={labels} onSelect={setSelectedSlot} />
      )}

      <p className="slots-footer">
        Set a label on a slot and it will appear on the button above. Test new settings on a login page
        with a keyboard before relying on them in production.
      </p>
    </div>
  );
};

const ClassicSlotLayout: React.FC<{
  labels: Record<number, string>;
  onSelect: (index: number) => void;
}> = ({ labels, onSelect }) => (
  <div className="slots-classic-wrap">
    <div className="slots-classic-grid">
      {CLASSIC_SLOT_ROWS.map((row, rowIdx) => (
        <React.Fragment key={rowIdx}>
          <SlotColumn slots={row.left} labels={labels} onSelect={onSelect} align="right" />
          {rowIdx === 0 && (
            <div className="slots-classic-device-wrap">
              <img
                src={CLASSIC_DEVICE_IMG_DARK}
                alt="OnlyKey device"
                className="slots-classic-device slots-device-img--dark"
                draggable={false}
              />
              <img
                src={CLASSIC_DEVICE_IMG_LIGHT}
                alt=""
                aria-hidden
                className="slots-classic-device slots-device-img--light"
                draggable={false}
              />
            </div>
          )}
          <SlotColumn slots={row.right} labels={labels} onSelect={onSelect} align="left" />
        </React.Fragment>
      ))}
    </div>
  </div>
);

const DuoSlotLayout: React.FC<{
  profile: DuoProfileId;
  onProfileChange: (p: DuoProfileId) => void;
  labels: Record<number, string>;
  onSelect: (index: number) => void;
}> = ({ profile, onProfileChange, labels, onSelect }) => {
  const columns = DUO_PROFILE_COLUMNS[profile];

  return (
    <div className="slots-duo-wrap">
      <div className="slots-duo-profile">
        <span className="slots-duo-profile-label">Profile:</span>
        {DUO_PROFILES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onProfileChange(p.id)}
            title={`${p.name} profile`}
            className={`slots-profile-dot ${p.color} ${profile === p.id ? 'slots-profile-dot--active' : ''}`}
          />
        ))}
      </div>

      <div className="slots-duo-device-wrap">
        <img
          src={DUO_DEVICE_IMG_DARK}
          alt="OnlyKey DUO device"
          className="slots-duo-device slots-device-img--dark"
          draggable={false}
        />
        <img
          src={DUO_DEVICE_IMG_LIGHT}
          alt=""
          aria-hidden
          className="slots-duo-device slots-device-img--light"
          draggable={false}
        />
      </div>

      <div className="slots-duo-columns">
        {columns.map((colSlots, colIdx) => (
          <div key={colIdx} className="slots-duo-col">
            {colSlots.map((slot) => (
              <SlotPill
                key={slot.index}
                slotId={slot.id}
                index={slot.index}
                label={labels[slot.index]}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const SlotColumn: React.FC<{
  slots: { id: string; index: number }[];
  labels: Record<number, string>;
  onSelect: (index: number) => void;
  align: 'left' | 'right';
}> = ({ slots, labels, onSelect, align }) => (
  <div className={`slots-classic-col slots-classic-col--${align}`}>
    {slots.map((slot) => (
      <SlotPill
        key={slot.index}
        slotId={slot.id}
        index={slot.index}
        label={labels[slot.index]}
        onSelect={onSelect}
        align={align}
      />
    ))}
  </div>
);

interface SlotPillProps {
  slotId: string;
  index: number;
  label?: string;
  onSelect: (index: number) => void;
  align?: 'left' | 'right' | 'center';
}

const SlotPill: React.FC<SlotPillProps> = ({
  slotId,
  index,
  label,
  onSelect,
  align = 'center',
}) => {
  const isEmpty = !label || label.toLowerCase() === 'empty';
  const displayLabel = isEmpty ? EMPTY_SLOT_LABEL : label;

  return (
    <div className={`slot-pill-wrap slot-pill-wrap--${align}`}>
      <button
        type="button"
        onClick={() => onSelect(index)}
        className={`slot-pill ${isEmpty ? 'slot-pill--empty' : ''}`}
        title={isEmpty ? `Slot ${slotId}: no label set` : `${slotId}: ${displayLabel}`}
      >
        <span className="slot-pill-text">
          {slotId} {displayLabel}
        </span>
      </button>
    </div>
  );
};

export default SlotGrid;