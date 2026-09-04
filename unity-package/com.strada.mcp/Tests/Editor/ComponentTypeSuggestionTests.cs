using System.Collections.Generic;
using NUnit.Framework;
using Strada.Mcp.Editor.Commands;

namespace Strada.Mcp.Tests.Editor
{
    /// <summary>
    /// Measured live 2026-09-04: a campaign sprint called scene_build with
    /// Game.Modules.PixelFlowSim.Views.TapInputService. The type exists as
    /// Game.Modules.PixelFlowSim.TapInputService — one invented namespace
    /// segment away — and the answer was "Scene NOT assembled. type not found:
    /// &lt;name&gt;". That sentence cannot be acted on: it does not say whether
    /// the type is missing, misspelled, or in another namespace. The scene was
    /// never assembled.
    /// </summary>
    [TestFixture]
    public class ComponentTypeSuggestionTests
    {
        private static readonly List<string> Domain = new List<string>
        {
            "Game.Modules.PixelFlowSim.TapInputService",
            "UnityEngine.MeshRenderer",
            "A.Dup.Thing",
            "B.Dup.Thing",
        };

        [Test]
        public void NamesTheTypeWhenOnlyTheNamespaceIsWrong()
        {
            string message = ComponentTypeSuggestion.Describe(
                "Game.Modules.PixelFlowSim.Views.TapInputService", Domain);

            Assert.That(message, Does.Contain("Use 'Game.Modules.PixelFlowSim.TapInputService'"));
            Assert.That(message, Does.Contain("namespace you gave does not exist"));
        }

        [Test]
        public void SaysNothingOfThatNameExistsWhenNothingDoes()
        {
            // A different instruction from "wrong namespace": nothing to
            // correct, the script is missing or does not compile.
            string message = ComponentTypeSuggestion.Describe("Game.Nope.NoSuchThing", Domain);

            Assert.That(message, Does.Contain("No component type named 'NoSuchThing'"));
            Assert.That(message, Does.Contain("may not compile"));
        }

        [Test]
        public void NamesEveryCandidateWhenTheShortNameIsAmbiguous()
        {
            string message = ComponentTypeSuggestion.Describe("X.Y.Thing", Domain);

            Assert.That(message, Does.Contain("2 components are named 'Thing'"));
            Assert.That(message, Does.Contain("A.Dup.Thing"));
            Assert.That(message, Does.Contain("B.Dup.Thing"));
        }

        [Test]
        public void SaysItTrimmedInsteadOfCappingSilently()
        {
            var many = new List<string>();
            for (int i = 0; i < ComponentTypeSuggestion.MaxNamed + 4; i++) many.Add("N" + i + ".Widget");

            Assert.That(ComponentTypeSuggestion.Describe("Q.Widget", many), Does.Contain("+4 more"));
        }

        [Test]
        public void DegenerateInputDoesNotThrow()
        {
            Assert.That(ComponentTypeSuggestion.Describe("", Domain), Does.Contain("Component type not found"));
            Assert.That(ComponentTypeSuggestion.Describe("A.B", null), Does.Contain("No component type named 'B'"));
        }
    }
}
