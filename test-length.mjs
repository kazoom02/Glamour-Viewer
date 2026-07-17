try { new Float32Array(new ArrayBuffer(8), 0, 4) } catch (e) { console.error(e.message) }
try { new Float32Array(new ArrayBuffer(8), 4, 2) } catch (e) { console.error(e.message) }
