#if UNITY_EDITOR
using System.Collections.Generic;
using Strada.Mcp.Editor.Server;

namespace Strada.Mcp.Editor.Commands
{
    public static class StradaCommands
    {
        public static void Register(CommandDispatcher dispatcher)
        {
            dispatcher.RegisterHandler("strada.moduleGraph", ModuleGraphCommand);
            dispatcher.RegisterHandler("strada.containerGraph", ContainerGraphCommand);
            dispatcher.RegisterHandler("strada.architectureValidate", ArchitectureValidateCommand);
            dispatcher.RegisterHandler("strada.moduleValidate", ModuleValidateCommand);
            dispatcher.RegisterHandler("strada.systemProfile", SystemProfileCommand);
            dispatcher.RegisterHandler("strada.hotReload", HotReloadCommand);
            dispatcher.RegisterHandler("strada.logSettings", LogSettingsCommand);
            dispatcher.RegisterHandler("strada.validationReport", ValidationReportCommand);
        }

        private static object ModuleGraphCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.StradaCore.StradaCoreCommands, StradaMcp.Editor.StradaCore",
                "ModuleGraph",
                @params,
                "strada-core");
        }

        private static object ContainerGraphCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.StradaCore.StradaCoreCommands, StradaMcp.Editor.StradaCore",
                "ContainerGraph",
                @params,
                "strada-core");
        }

        private static object ArchitectureValidateCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.StradaCore.StradaCoreCommands, StradaMcp.Editor.StradaCore",
                "ArchitectureValidate",
                @params,
                "strada-core");
        }

        private static object ModuleValidateCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.StradaCore.StradaCoreCommands, StradaMcp.Editor.StradaCore",
                "ModuleValidate",
                @params,
                "strada-core");
        }

        private static object SystemProfileCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.StradaCore.StradaCoreCommands, StradaMcp.Editor.StradaCore",
                "SystemProfile",
                @params,
                "strada-core");
        }

        private static object HotReloadCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.StradaCore.StradaCoreCommands, StradaMcp.Editor.StradaCore",
                "HotReload",
                @params,
                "strada-core");
        }

        private static object LogSettingsCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.StradaCore.StradaCoreCommands, StradaMcp.Editor.StradaCore",
                "LogSettings",
                @params,
                "strada-core");
        }

        private static object ValidationReportCommand(Dictionary<string, object> @params)
        {
            return OptionalCommandRouter.Invoke(
                "Strada.Mcp.Editor.Integration.StradaCore.StradaCoreCommands, StradaMcp.Editor.StradaCore",
                "ValidationReport",
                @params,
                "strada-core");
        }
    }
}
#endif
