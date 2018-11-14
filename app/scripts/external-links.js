if (typeof nw !== 'undefined') {
    document.querySelector('#main').addEventListener('click', evt => {
        if ((evt.target !== evt.currentTarget) && (!!evt.target.href && evt.target.className.includes('external'))) {
            // nw.Window.open(evt.target.href);
            nw.Shell.openExternal(evt.target.href);
            evt.preventDefault();
            evt.stopPropagation();
        }
    });
}
