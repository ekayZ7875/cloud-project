import './index.js';

process.on('exit', (code) => {
  console.log('Process exiting with code:', code);
});

process.on('beforeExit', (code) => {
  console.log('Process beforeExit with code:', code);
  
  if (process._getActiveHandles) {
    const handles = process._getActiveHandles();
    console.log(`Active handles count: ${handles.length}`);
    handles.forEach((h, idx) => {
      console.log(`Handle ${idx + 1}:`, h.constructor.name, {
        fd: h._handle?.fd,
        reading: h._handle?.reading,
        address: h.address ? h.address() : null
      });
    });
  }
});
