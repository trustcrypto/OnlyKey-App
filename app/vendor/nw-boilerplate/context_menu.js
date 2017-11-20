// This gives you default context menu (cut, copy, paste)
// in all input fields and textareas across your app.

(function () {
    'use strict';
        
    var cut = new nw.MenuItem({
        label: "Cut",
        click: function () {
            document.execCommand("cut");
        }
    });
    
    var copy = new nw.MenuItem({
        label: "Copy",
        click: function () {
            document.execCommand("copy");
        }
    })
    
    var paste = new nw.MenuItem({
        label: "Paste",
        click: function () {
            document.execCommand("paste");
        }
    });
    
    var textMenu = new nw.Menu();
    textMenu.append(cut);
    textMenu.append(copy);
    textMenu.append(paste);
    
    document.addEventListener('contextmenu', function(e) {
        
        switch (e.target.nodeName) {
            case 'TEXTAREA':
            case 'INPUT':
                e.preventDefault();
                textMenu.popup(e.x, e.y);
                break;
        }
        
    }, false);
  
}());
