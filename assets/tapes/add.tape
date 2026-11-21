Source assets/tapes/common.tape
Output assets/demo-add.gif
Hide
Type "unset TMUX; export PK_TMUX_SOCKET=demo PK_CONFIG=$PWD/demo/config.json PATH=$PWD/demo/bin:$PATH; cp demo/config.base.jsonc demo/config.json; tmux -L demo kill-server 2>/dev/null; tmux -L demo -f demo/tmux.conf new-session -d -s keep; clear" Enter
Sleep 1s
Type "cd demo/projects/new-app; clear" Enter
Sleep 500ms
Show
Sleep 500ms
Type "pk add"
Sleep 300ms
Enter
Sleep 1.5s
Enter
Sleep 1s
Down
Sleep 300ms
Space
Sleep 300ms
Down
Sleep 300ms
Space
Sleep 800ms
Enter
Sleep 1s
Enter
Sleep 2.5s
Type "pk new-app"
Sleep 300ms
Enter
Sleep 3s
Ctrl+B
Type "d"
Sleep 800ms
Hide
Type@0 "tmux -L demo kill-server; cp demo/config.base.jsonc demo/config.json; clear" Enter
Sleep 500ms
Type@0 "cd ../../..; clear" Enter
