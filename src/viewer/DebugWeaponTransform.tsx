import { useState, useEffect } from 'react';

export function DebugWeaponTransform() {
  const [minimized, setMinimized] = useState(false);
  const [active, setActive] = useState(false);

  const [swordX, setSwordX] = useState(0);
  const [swordY, setSwordY] = useState(0);
  const [swordZ, setSwordZ] = useState(0);
  const [swordScale, setSwordScale] = useState(1);
  const [swordRotX, setSwordRotX] = useState(0);
  const [swordRotY, setSwordRotY] = useState(0);
  const [swordRotZ, setSwordRotZ] = useState(0);
  const [swordPreZ, setSwordPreZ] = useState(0);

  const [shieldX, setShieldX] = useState(0);
  const [shieldY, setShieldY] = useState(0);
  const [shieldZ, setShieldZ] = useState(0);
  const [shieldScale, setShieldScale] = useState(1);
  const [shieldRotX, setShieldRotX] = useState(0);
  const [shieldRotY, setShieldRotY] = useState(0);
  const [shieldRotZ, setShieldRotZ] = useState(0);
  const [shieldPreZ, setShieldPreZ] = useState(0);

  useEffect(() => {
    if (active) {
      (window as any).debugPos = { swordX, swordY, swordZ, swordScale, shieldX, shieldY, shieldZ, shieldScale };
      (window as any).debugRot = { swordRotX, swordRotY, swordRotZ, swordPreZ, shieldRotX, shieldRotY, shieldRotZ, shieldPreZ };
      
      if ((window as any).applyWeaponRestingMounts) {
        (window as any).applyWeaponRestingMounts();
      }
    } else {
      (window as any).debugPos = undefined;
      (window as any).debugRot = undefined;
      if ((window as any).applyWeaponRestingMounts) {
        (window as any).applyWeaponRestingMounts();
      }
    }
  }, [
    active, swordX, swordY, swordZ, swordScale, swordRotX, swordRotY, swordRotZ, swordPreZ,
    shieldX, shieldY, shieldZ, shieldScale, shieldRotX, shieldRotY, shieldRotZ, shieldPreZ
  ]);

  const labelStyle = { display: 'flex', justifyContent: 'space-between', fontSize: '10px' };

  if (minimized) {
    return (
      <button 
        style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 9999, background: 'rgba(0,0,0,0.8)', padding: '5px 10px', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
        onClick={() => setMinimized(false)}
      >
        Show Debug
      </button>
    );
  }

  return (
    <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 9999, background: 'rgba(0,0,0,0.8)', padding: '10px', color: 'white', borderRadius: '8px', width: '280px', maxHeight: '90vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <strong>Main Hand Sheathed</strong>
        <button onClick={() => setMinimized(true)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>_</button>
      </div>
      <div style={{ marginBottom: '10px', fontSize: '10px' }}>
        <em>Values will only apply if active.</em>
        <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active</label>
      </div>
      <div style={{ marginBottom: '10px', display: 'flex', gap: '5px' }}>
        <button onClick={() => {
          setActive(true);
          setSwordX(-0.15); setSwordY(-0.04); setSwordZ(0); setSwordScale(0.88);
          setSwordRotX(0); setSwordRotY(180); setSwordRotZ(-90); setSwordPreZ(180);
        }} style={{ fontSize: '9px', padding: '2px' }}>Load: Sword</button>
        <button onClick={() => {
          setActive(true);
          setSwordX(-0.27); setSwordY(0.34); setSwordZ(-0.16); setSwordScale(0.9);
          setSwordRotX(83); setSwordRotY(-6); setSwordRotZ(89); setSwordPreZ(-19);
        }} style={{ fontSize: '9px', padding: '2px' }}>Load: Axe</button>
      </div>
      <div style={{ marginBottom: '10px' }}>
        <label style={labelStyle}>Pos X: {swordX.toFixed(2)} <input type="range" min="-2" max="2" step="0.01" value={swordX} onChange={e => { setActive(true); setSwordX(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Pos Y: {swordY.toFixed(2)} <input type="range" min="-2" max="2" step="0.01" value={swordY} onChange={e => { setActive(true); setSwordY(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Pos Z: {swordZ.toFixed(2)} <input type="range" min="-2" max="2" step="0.01" value={swordZ} onChange={e => { setActive(true); setSwordZ(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Scale: {swordScale.toFixed(2)} <input type="range" min="0.5" max="1.5" step="0.01" value={swordScale} onChange={e => { setActive(true); setSwordScale(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Rot X: {swordRotX.toFixed(0)} <input type="range" min="-180" max="180" value={swordRotX} onChange={e => { setActive(true); setSwordRotX(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Rot Y: {swordRotY.toFixed(0)} <input type="range" min="-180" max="180" value={swordRotY} onChange={e => { setActive(true); setSwordRotY(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Rot Z: {swordRotZ.toFixed(0)} <input type="range" min="-180" max="180" value={swordRotZ} onChange={e => { setActive(true); setSwordRotZ(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Pre Z: {swordPreZ.toFixed(0)} <input type="range" min="-180" max="180" value={swordPreZ} onChange={e => { setActive(true); setSwordPreZ(Number(e.target.value)) }} /></label>
      </div>
      <div>
        <strong>Off Hand Sheathed</strong>
      </div>
      <div style={{ marginBottom: '10px', display: 'flex', gap: '5px' }}>
        <button onClick={() => {
          setActive(true);
          setShieldX(0.19); setShieldY(0.01); setShieldZ(0.01); setShieldScale(0.9);
          setShieldRotX(0); setShieldRotY(180); setShieldRotZ(90); setShieldPreZ(180);
        }} style={{ fontSize: '9px', padding: '2px' }}>Load: Shield</button>
      </div>
      <div>
        <label style={labelStyle}>Pos X: {shieldX.toFixed(2)} <input type="range" min="-2" max="2" step="0.01" value={shieldX} onChange={e => { setActive(true); setShieldX(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Pos Y: {shieldY.toFixed(2)} <input type="range" min="-2" max="2" step="0.01" value={shieldY} onChange={e => { setActive(true); setShieldY(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Pos Z: {shieldZ.toFixed(2)} <input type="range" min="-2" max="2" step="0.01" value={shieldZ} onChange={e => { setActive(true); setShieldZ(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Scale: {shieldScale.toFixed(2)} <input type="range" min="0.5" max="1.5" step="0.01" value={shieldScale} onChange={e => { setActive(true); setShieldScale(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Rot X: {shieldRotX.toFixed(0)} <input type="range" min="-180" max="180" value={shieldRotX} onChange={e => { setActive(true); setShieldRotX(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Rot Y: {shieldRotY.toFixed(0)} <input type="range" min="-180" max="180" value={shieldRotY} onChange={e => { setActive(true); setShieldRotY(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Rot Z: {shieldRotZ.toFixed(0)} <input type="range" min="-180" max="180" value={shieldRotZ} onChange={e => { setActive(true); setShieldRotZ(Number(e.target.value)) }} /></label>
        <label style={labelStyle}>Pre Z: {shieldPreZ.toFixed(0)} <input type="range" min="-180" max="180" value={shieldPreZ} onChange={e => { setActive(true); setShieldPreZ(Number(e.target.value)) }} /></label>
      </div>
    </div>
  );
}
