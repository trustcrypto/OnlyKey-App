const dialogMgr = new DialogMgr();
(document.querySelectorAll('[data-dialog]') || []).forEach(trigger => {
    trigger.addEventListener('click', e => {
        e && e.preventDefault && e.preventDefault();
        const dialog = document.getElementById(trigger.getAttribute('data-dialog'));
        dialogMgr.open(dialog);
    });
});
(document.querySelectorAll('.dialog-close') || []).forEach(btn => {
    btn.addEventListener('click', e => {
        e && e.preventDefault && e.preventDefault();
        dialogMgr.close(btn.parentNode);
    });
});
