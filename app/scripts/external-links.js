document.querySelector('#main').addEventListener('click', evt => {
    const parent = (evt.path && evt.path[1]) || {};
    const href = evt.target && evt.target.href ? evt.target.href : parent.href;
    let cancelDefault = false;

    if ((evt.target !== evt.currentTarget) && (!!href && (evt.target.classList.contains('external') || parent.classList.contains('external')))) {
        const openMethod = typeof nw === 'undefined' ? window.open : nw.Shell.openExternal;
        openMethod(href);
        cancelDefault = true;
    }
    
    cancelDefault && evt.preventDefault() && evt.stopPropagation();
});
