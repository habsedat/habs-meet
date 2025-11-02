export function deviceTier(): 'gpu' | 'cpu' | 'low' {
  const wgl = (() => {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  })();
  
  const mem = (navigator as any).deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  
  if (wgl && mem >= 4 && cores >= 4) return 'gpu';
  if (mem >= 2) return 'cpu';
  return 'low';
}





