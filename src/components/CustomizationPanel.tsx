import { useEffect, useState } from 'react'
import type { CharacterRaceCode } from '../asset-source/characterPlan'
import {
  TRIBE_PRESETS,
  raceCodeForCustomization,
  type CharacterCustomization,
  type CharacterGender,
} from '../customization/types'
import {
  FALLBACK_CUSTOMIZATION_CATALOG,
  fetchCustomizationCatalog,
  type CustomizationCatalog,
  type VisualCustomizationField,
} from '../customization/options'
import HairstylePicker from './HairstylePicker'
import { VisualBitmaskPicker, VisualOptionPicker } from './VisualOptionPicker'

interface Props {
  raceCode: CharacterRaceCode
  customization: CharacterCustomization
  onChange: (customization: CharacterCustomization) => void
  onRaceChange: (raceCode: CharacterRaceCode) => void
}

export default function CustomizationPanel({ customization, onChange, onRaceChange }: Props) {
  const [catalog, setCatalog] = useState<CustomizationCatalog>(FALLBACK_CUSTOMIZATION_CATALOG)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    setCatalogLoading(true)
    setCatalogError(undefined)
    void fetchCustomizationCatalog(customization.tribeId, customization.gender, controller.signal).then((next) => {
      if (controller.signal.aborted) return
      setCatalog(next)
      setCatalogLoading(false)
    }).catch((reason) => {
      if (controller.signal.aborted) return
      setCatalog(FALLBACK_CUSTOMIZATION_CATALOG)
      setCatalogLoading(false)
      setCatalogError(reason instanceof Error ? reason.message : 'Customization icons could not be loaded.')
    })
    return () => controller.abort()
  }, [customization.tribeId, customization.gender])

  function update<K extends keyof CharacterCustomization>(field: K, value: CharacterCustomization[K]) {
    onChange({ ...customization, [field]: value })
  }

  function selectIdentity(tribeId: number, gender: CharacterGender) {
    const next = { ...customization, tribeId, gender }
    onChange(next)
    onRaceChange(raceCodeForCustomization(next))
  }

  const visualField = (
    label: string,
    field: keyof CharacterCustomization,
    catalogField: VisualCustomizationField,
  ) => (
    <VisualOptionPicker
      key={field}
      label={label}
      value={Number(customization[field])}
      options={catalog.options[catalogField]}
      onChange={(value) => update(field, value as never)}
      loading={catalogLoading}
      error={catalogError}
    />
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
    <section className="customization-panel" aria-label="Customization">
      <div className="customization-identity">
        <VisualOptionPicker
          label="Race / Tribe"
          value={customization.tribeId}
          options={TRIBE_PRESETS.map((tribe) => ({
            value: tribe.id,
            label: tribe.race,
            detail: tribe.tribe,
            badge: tribe.race.slice(0, 2).toUpperCase(),
          }))}
          onChange={(tribeId) => selectIdentity(tribeId, customization.gender)}
          eyebrow="All playable tribes"
        />
        <VisualOptionPicker<CharacterGender>
          label="Gender"
          value={customization.gender}
          options={[
            { value: 'female', label: 'Female', detail: 'Female character model', badge: 'F' },
            { value: 'male', label: 'Male', detail: 'Male character model', badge: 'M' },
          ]}
          onChange={(gender) => selectIdentity(customization.tribeId, gender)}
          eyebrow="Character model"
        />
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
        {customization.gender === 'female' && (
          <label className="customization-field range-field">
            <span>Bust Size</span>
            <input
              type="range"
              min={0}
              max={100}
              value={customization.bustSize}
              onChange={(event) => update('bustSize', Number(event.target.value))}
            />
            <output>{customization.bustSize}</output>
          </label>
        )}
        {visualField('Face', 'face', 'face')}
        {colorField('Skin Color', 'skinColor')}
        <HairstylePicker
          tribeId={customization.tribeId}
          gender={customization.gender}
          value={customization.hairstyle}
          onChange={(hairstyle) => update('hairstyle', hairstyle)}
        />
        {colorField('Hair Color', 'hairColor')}
        {visualField('Jaw', 'jaw', 'jaw')}
        {visualField('Eye Shape', 'eyeShape', 'eyeShape')}
        {visualField('Iris Size', 'irisSize', 'irisSize')}
        {colorField('Eye Color', 'eyeColor')}
        {visualField('Eyebrows', 'eyebrows', 'eyebrows')}
        {visualField('Nose', 'nose', 'nose')}
        {visualField('Mouth', 'mouth', 'mouth')}
        {colorField('Lip Color', 'lipColor')}
        <VisualBitmaskPicker label="Facial Features" value={customization.facialFeatures} count={catalog.facialFeatureCount} onChange={(value) => update('facialFeatures', value)} />
        <VisualBitmaskPicker label="Tattoos" value={customization.tattoos} count={catalog.tattooCount} onChange={(value) => update('tattoos', value)} />
        {colorField('Tattoo Color', 'tattooColor')}
        {visualField('Face Paint', 'facePaint', 'facePaint')}
        {colorField('Face Paint Color', 'facePaintColor')}
      </div>

      <p className="customization-note">
        Every picker now drives the local model: face shapes use the MDL's native index-replacement geometry, feature checkboxes select atr_fv submeshes, and face paint uses the local decal texture on the face's second UV set.
      </p>
    </section>
  )
}
