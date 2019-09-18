if (typeof nw !== 'undefined') {
    document.querySelector('#main').addEventListener('click', evt => {
        const parent = (evt.path && evt.path[1]) || {};
        const href = evt.target && evt.target.href ? evt.target.href : parent.href;

        if ((evt.target !== evt.currentTarget) && (!!href && (evt.target.classList.contains('external') || parent.classList.contains('external')))) {
            // nw.Window.open(evt.target.href);
            nw.Shell.openExternal(href);
            evt.preventDefault();
            evt.stopPropagation();
        }
    });
}
