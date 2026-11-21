Source assets/tapes/common.tape
Output assets/demo-ls.gif
Hide
Type "unset TMUX; export PK_TMUX_SOCKET=demo PK_CONFIG=$PWD/demo/config.json PATH=$PWD/demo/bin:$PATH; cp demo/config.base.jsonc demo/config.json; tmux -L demo kill-server 2>/dev/null; tmux -L demo -f demo/tmux.conf new-session -d -s keep; clear" Enter
Sleep 1s
Type "pk shop -d; pk blog -d; clear" Enter
Sleep 1.5s
Show
Sleep 500ms
Type "pk ls"
Sleep 300ms
Enter
Sleep 2.5s
Type "pk kill shop"
Sleep 300ms
Enter
Sleep 1.5s
Type "pk ls"
Sleep 300ms
Enter
Sleep 2.5s
Hide
Type@0 "tmux -L demo kill-server; cp demo/config.base.jsonc demo/config.json; clear" Enter
Sleep 500ms
