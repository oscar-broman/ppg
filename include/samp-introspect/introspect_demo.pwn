#include <a_samp>

#define INTROSPECT_NATIVES
#define AMX_NAME "introspect_demo.amx"
#include "introspect"

new g_LocalVariable = 5;
new Float:g_LocalArray[123][456];

SomeFunction(int, Float:flt, str[]) {
	printf("args: %d", numargs());
	printf("int: %d", int);
	printf("flt: %f", flt);
	printf("str: %s", str);
}

Float:ReturnFloat() {
	return 123.456;
}

ReturnInt() {
	return 555;
}

forward _funcinc_introspect();
public _funcinc_introspect() {
	SomeFunction(0, 0.0, "");
	ReturnFloat();
	ReturnInt();
}

new g_TestString[128] = "hello world";
new g_TestInt = 123;
new Float:g_TestFloat = 123.456;
new g_TestArray[20];
new g_TestArray2[20][20];

main() {
	IntrospectInit();
	
	print(g_TestString);
	RunSimpleStatement("g_TestString = \"goodbye world!\"");
	print(g_TestString);
	
	printf("%d", g_TestInt);
	RunSimpleStatement("g_TestInt = 456");
	printf("%d", g_TestInt);
	
	printf("%f", g_TestFloat);
	RunSimpleStatement("g_TestFloat = 456.789");
	printf("%f", g_TestFloat);
	
	RunSimpleStatement("SomeFunction(123, 456.678, \"hellooooo!\")");
	RunSimpleStatement("printf(\"hello %s %f.\", \"world\", &12.34)");
	RunSimpleStatement("SendRconCommand(\"echo hello from rcon!\")");
	
	new type, output[1];
	
	RunSimpleStatement("ReturnFloat()", type, output);
	printf("return (%c): %f", type, output[0]);
	RunSimpleStatement("ReturnInt()", type, output);
	printf("return (%c): %d", type, output[0]);
	
	// ---------------------------------
	// Advanced usage
	// ---------------------------------
	
	g_LocalVariable = g_LocalVariable++;
	g_LocalArray[1][2] = g_LocalArray[3][4] + 5.6;
	
	new info[E_VARIABLE];
	
	if (GetVariableInfo("g_LocalVariable", info)) {
		print(info[Name]);
		printf("  Address: %08x", info[Address]);
		printf("  Tag: %04x", info[Tag]);
		printf("  Dimensions: %d", info[Dimensions]);
		printf("  Dimension sizes: %d %d %d", info[DimensionSize][0], info[DimensionSize][1], info[DimensionSize][2]);
	} else {
		print("Variable not found.");
	}
	
	if (GetVariableInfo("g_LocalArray", info)) {
		print(info[Name]);
		printf("  Address: %08x", info[Address]);
		printf("  Tag: %04x", info[Tag]);
		printf("  Dimensions: %d", info[Dimensions]);
		printf("  Dimension sizes: %d %d %d", info[DimensionSize][0], info[DimensionSize][1], info[DimensionSize][2]);
	} else {
		print("Variable not found.");
	}
	
	g_TestArray[3] = 11;
	g_TestArray2[7][8] = 22;
	
	printf("%d, %d", g_TestArray[3], g_TestArray2[7][8]);
	
	RunSimpleStatement("g_TestArray[3] = 33");
	RunSimpleStatement("g_TestArray2[7][8] = 44");
	
	printf("%d, %d", g_TestArray[3], g_TestArray2[7][8]);
	
	new Float:asd;
	printf("%08x",tagof(asd));
}

