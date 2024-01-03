const openMethod = typeof nw === 'undefined' ? window.open : nw.Shell.openExternal;

const handler = evt => {
    let href = evt.target && evt.target.href;
    if (!href) href = evt.target && evt.target.offsetParent && evt.target.offsetParent.href;
    if (!href) href = evt.path && evt.path[1] && evt.path[1].href;
    
    // Formerly checked for 'external' in classList. Now fires for all https:// links.
    if (!!href && href.indexOf('https://') == 0) {
        openMethod(href);
        evt.preventDefault && evt.preventDefault();
        evt.stopPropgation && evt.stopPropagation();
    }
};

[
    '#main',
    '#udev-dialog',
].forEach(sel => document.querySelector(sel).addEventListener('click', handler));
