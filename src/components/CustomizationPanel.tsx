import type { CharacterRaceCode } from '../asset-source/characterPlan'
import {
  TRIBE_PRESETS,
  raceCodeForCustomization,
  type CharacterCustomization,
  type CharacterGender,
} from '../customization/types'

interface Props {
  raceCode: CharacterRaceCode
  customization: CharacterCustomization
  onChange: (customization: CharacterCustomization) => void
  onRaceChange: (raceCode: CharacterRaceCode) => void
}

function NumberOptions({ count, includeNone = false }: { count: number; includeNone?: boolean }) {
  return (
    <>
      {includeNone && <option value={0}>None</option>}
      {Array.from({ length: count }, (_, index) => index + 1).map((value) => (
        <option value={value} key={value}>{value}</option>
      ))}
    </>
  )
}

export default function CustomizationPanel({ raceCode, customization, onChange, onRaceChange }: Props) {
  function update<K extends keyof CharacterCustomization>(field: K, value: CharacterCustomization[K]) {
    onChange({ ...customization, [field]: value })
  }

  function selectIdentity(tribeId: number, gender: CharacterGender) {
    const next = { ...customization, tribeId, gender }
    onChange(next)
    onRaceChange(raceCodeForCustomization(next))
  }

  const numberField = (
    label: string,
    field: keyof CharacterCustomization,
    count: number,
    includeNone = false,
  ) => (
    <label className="customization-field" key={field}>
      <span>{label}</span>
      <select
        value={String(customization[field])}
        onChange={(event) => update(field, Number(event.target.value) as never)}
      >
        <NumberOptions count={count} includeNone={includeNone} />
      </select>
    </label>
  )

  const colorField = (label: string, field: keyof CharacterCustomization) => (
    <label className="customization-field color-field" key={field}>
      <span>{label}</span>
      <input
        type="color"
        value={String(customization[field])}
        onChange={(event) => update(field, event.target.value as never)}
      />
      <code>{String(customization[field]).toUpperCase()}</code>
    </label>
  )

  return (
    <section className="customization-panel" aria-labelledby="customization-title">
      <div className="catalog-heading customization-heading">
        <div>
          <p className="eyebrow">Character creator</p>
          <h2 id="customization-title">Customization</h2>
          <p>Choose any playable race, tribe, and gender, then edit the character appearance used by the local preview.</p>
        </div>
        <span className="catalog-version">Model {raceCode}</span>
      </div>

      <div className="customization-identity">
        <label className="customization-field wide">
          <span>Race / Tribe</span>
          <select
            value={customization.tribeId}
            onChange={(event) => selectIdentity(Number(event.target.value), customization.gender)}
          >
            {TRIBE_PRESETS.map((tribe) => (
              <option value={tribe.id} key={tribe.id}>{tribe.race} / {tribe.tribe}</option>
            ))}
          </select>
        </label>
        <label className="customization-field">
          <span>Gender</span>
          <select
            value={customization.gender}
            onChange={(event) => selectIdentity(customization.tribeId, event.target.value as CharacterGender)}
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>
      </div>

      <div className="customization-grid">
        <label className="customization-field range-field">
          <span>Muscle Tone</span>
          <input
            type="range"
            min={0}
            max={100}
            value={customization.muscleTone}
            onChange={(event) => update('muscleTone', Number(event.target.value))}
          />
          <output>{customization.muscleTone}</output>
        </label>
        {numberField('Face', 'face', 4)}
        {colorField('Skin Color', 'skinColor')}
        {numberField('Hairstyle', 'hairstyle', 200)}
        {colorField('Hair Color', 'hairColor')}
        {numberField('Jaw', 'jaw', 4)}
        {numberField('Eye Shape', 'eyeShape', 6)}
        <label className="customization-field range-field">
          <span>Iris Size</span>
          <input
            type="range"
            min={0}
            max={100}
            value={customization.irisSize}
            onChange={(event) => update('irisSize', Number(event.target.value))}
          />
          <output>{customization.irisSize}</output>
        </label>
        {colorField('Eye Color', 'eyeColor')}
        {numberField('Eyebrows', 'eyebrows', 6)}
        {numberField('Nose', 'nose', 6)}
        {numberField('Mouth', 'mouth', 4)}
        {colorField('Lip Color', 'lipColor')}
        {numberField('Facial Features', 'facialFeatures', 7, true)}
        {numberField('Tattoos', 'tattoos', 7, true)}
        {colorField('Tattoo Color', 'tattooColor')}
        {numberField('Face Paint', 'facePaint', 20, true)}
        {colorField('Face Paint Color', 'facePaintColor')}
      </div>

      <p className="customization-note">
        Race, gender, face model, hairstyle, skin, hair, eye, tattoo, and paint colors update the preview. Detailed jaw, eye, nose, and mouth geometry is retained in the appearance profile while face morph decoding is completed.
      </p>
    </section>
  )
}
