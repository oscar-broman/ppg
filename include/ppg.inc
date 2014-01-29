#tryinclude <crashdetect>

#define INTROSPECT_NATIVES
#define INTROSPECT_PLAYER_DATA

#define AMX_NAME "ppg-gm.amx"

#include "samp-introspect/exec"

#if !defined RunExpression
    #error The samp-introspect library is missing. Make sure it's in the include directory.
#endif

public OnRconCommand(cmd[]) {
    if (!strcmp(cmd, "runcode ", _, 8)) {
        new dest[512], token[E_TOKEN];

        token = RunExpression(cmd[8], strlen(cmd[8]));

        RenderToken(dest, token);

        if (strlen(dest)) {
          printf("< %s", dest);
        } else {
          print("< NULL");
        }

        return 1;
    }

    return 0;
}