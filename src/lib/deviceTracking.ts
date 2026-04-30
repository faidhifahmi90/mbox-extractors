export const getDeviceFingerprint = async (): Promise<string> => {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('unknown');
      
      const txt = 'vmail_tracking_fp_2026';
      ctx.textBaseline = "top";
      ctx.font = "14px 'Arial'";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125,1,62,20);
      ctx.fillStyle = "#069";
      ctx.fillText(txt, 2, 15);
      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.fillText(txt, 4, 17);
      
      const data = canvas.toDataURL();
      
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      
      const fp = 'fp_' + Math.abs(hash).toString(16);
      resolve(fp);
    } catch(e) {
      resolve('unknown');
    }
  });
};

export const checkTrialUsed = async (): Promise<boolean> => {
  let used = false;
  
  try {
     if (localStorage.getItem('vmail_trial_used') === 'true') {
        used = true;
     }
  } catch (e) {}
  
  if (!used) {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('vmail_device_db', 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('device_state');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction('device_state', 'readonly');
      const store = tx.objectStore('device_state');
      const val = await new Promise((resolve) => {
        const req = store.get('trial_used');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      if (val === true) used = true;
      db.close();
    } catch(e) {}
  }
  
  if (!used) {
    try {
      const cache = await caches.has('vmail_device_cache');
      if (cache) used = true;
    } catch(e) {}
  }
  
  if (!used) {
     try {
        const fp = await getDeviceFingerprint();
        if (fp !== 'unknown' && localStorage.getItem('vmail_fp_' + fp) === 'true') {
           used = true;
        }
     } catch(e) {}
  }

  return used;
};

export const markTrialUsed = async (): Promise<void> => {
  try {
     localStorage.setItem('vmail_trial_used', 'true');
  } catch (e) {}
  
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('vmail_device_db', 1);
      req.onupgradeneeded = () => {
         req.result.createObjectStore('device_state');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('device_state', 'readwrite');
    tx.objectStore('device_state').put(true, 'trial_used');
    db.close();
  } catch(e) {}
  
  try {
    const cache = await caches.open('vmail_device_cache');
    await cache.put('/trial-used', new Response('true'));
  } catch(e) {}
  
  try {
     const fp = await getDeviceFingerprint();
     if (fp !== 'unknown') {
        localStorage.setItem('vmail_fp_' + fp, 'true');
     }
  } catch (e) {}
};
