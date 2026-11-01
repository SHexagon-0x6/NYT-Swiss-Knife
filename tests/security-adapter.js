// Fixture-owned references emulate a trusted adapter, not a website-side bridge.
window.Margin.gameForPath=()=> 'crossword';
window.MarginGames={crossword:{mount(ctx){window.securityFixture.context=ctx;return{refresh(){},destroy(){}};}}};
