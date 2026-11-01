(() => {
  const records={};
  const changes=[];
  const clone=value=>structuredClone(value);
  window.chrome={
    runtime:{getURL:name=>new URL('../'+name,location.href).href},
    storage:{local:{
      async get(key){return key==null?clone(records):{[key]:clone(records[key])};},
      async set(items){Object.assign(records,clone(items));},
      async remove(keys){for(const key of keys)delete records[key];}
    },onChanged:{addListener:fn=>changes.push(fn)}}
  };
  window.securityFixture={records};
})();
