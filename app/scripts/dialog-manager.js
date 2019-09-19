class DialogMgr {
  open(el, keepOthersOpen) {
    if (!keepOthersOpen) {
      this.closeAll();
    }
    if (!el.open) {
      el.showModal();
    }
  }

  close(el) {
    if (el.open) {
      el.close();
    }
  }

  closeAll() {
    const allDialogs = document.getElementsByTagName('dialog');
    for (let i = 0; i < allDialogs.length; i++) {
      this.close(allDialogs[i]);
    }
  }
}
