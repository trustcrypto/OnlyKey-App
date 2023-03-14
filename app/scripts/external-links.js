const openMethod = typeof nw === 'undefined' ? window.open : nw.Shell.openExternal;

// Formerly checked for 'external' in classList. Now fires for all https:// links.
document.querySelector('#main').addEventListener('click', evt => {
    let href = evt.target && evt.target.href;
    if (!href) href = evt.target && evt.target.offsetParent && evt.target.offsetParent.href;
    if (!href) href = evt.path && evt.path[1] && evt.path[1].href;

    if (!!href && href.indexOf('https://') == 0) {
        openMethod(href);
        evt.preventDefault && evt.preventDefault();
        evt.stopPropgation && evt.stopPropagation();
    }
});
