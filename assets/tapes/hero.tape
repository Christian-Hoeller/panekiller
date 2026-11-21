Source assets/tapes/common.tape
Output assets/demo-hero.gif
Hide
Type "unset TMUX; export PK_TMUX_SOCKET=demo PK_CONFIG=$PWD/demo/config.json PATH=$PWD/demo/bin:$PATH; cp demo/config.base.jsonc demo/config.json; tmux -L demo kill-server 2>/dev/null; tmux -L demo -f demo/tmux.conf new-session -d -s keep; clear" Enter
Sleep 1s
Type "cd demo/projects/shop; clear" Enter
Sleep 500ms
Show
Sleep 600ms
Type "pk"
Sleep 400ms
Enter
Sleep 4s
Ctrl+B
Type "n"
Sleep 2.5s
Hide
Type@0 "tmux -L demo kill-server; cp demo/config.base.jsonc demo/config.json; clear" Enter
Sleep 500ms
