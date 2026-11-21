Source assets/tapes/common.tape
Output assets/demo-existing.gif
Hide
Type "unset TMUX; export PK_TMUX_SOCKET=demo PK_CONFIG=$PWD/demo/config.json PATH=$PWD/demo/bin:$PATH; cp demo/config.base.jsonc demo/config.json; tmux -L demo kill-server 2>/dev/null; tmux -L demo -f demo/tmux.conf new-session -d -s keep; clear" Enter
Sleep 1s
Type "pk shop be -d; clear" Enter
Sleep 1.5s
Show
Sleep 500ms
Type "pk shop fe"
Sleep 300ms
Enter
Sleep 2s
Type "r"
Sleep 300ms
Enter
Sleep 2.5s
Ctrl+B
Type "d"
Sleep 800ms
Type "pk shop --attach"
Sleep 300ms
Enter
Sleep 2s
Ctrl+B
Type "d"
Sleep 800ms
Hide
Type@0 "tmux -L demo kill-server; cp demo/config.base.jsonc demo/config.json; clear" Enter
Sleep 500ms
