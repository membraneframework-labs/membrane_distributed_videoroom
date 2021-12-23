defmodule VideoRoom.MixProject do
  use Mix.Project

  def project do
    [
      app: :membrane_videoroom_demo,
      version: "0.1.0",
      elixir: "~> 1.12",
      aliases: aliases(),
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  def application do
    [
      mod: {VideoRoom.Application, []},
      extra_applications: [:logger]
    ]
  end

  defp deps do
    [
      {:membrane_core, github: "membraneframework/membrane_core", override: true},
      {:esbuild, "~> 0.4", runtime: Mix.env() == :dev},
      {:membrane_rtc_engine, github: "membraneframework/membrane_rtc_engine"},
      {:membrane_webrtc_plugin,
       github: "membraneframework/membrane_webrtc_plugin", override: true},
      {:ex_sdp, github: "membraneframework/ex_sdp", override: true},
      {:ex_libnice, "~> 0.7.0", override: true},
      {:plug_cowboy, "~> 2.0"},
      {:phoenix, "~> 1.6"},
      {:phoenix_html, "~> 3.0"},
      {:phoenix_live_view, "~> 0.16.0"},
      {:phoenix_live_reload, "~> 1.2"},
      {:poison, "~> 3.1"},
      {:jason, "~> 1.2"},
      {:phoenix_inline_svg, "~> 1.4"},
      {:uuid, "~> 1.1"},
      {:telemetry, "~> 1.0.0", override: true},

      # Otel
      {:opentelemetry, "~> 1.0.0-rc.3", override: true},
      {:opentelemetry_api, "~> 1.0.0-rc.3.2", override: true},
      {:opentelemetry_exporter, "~> 1.0.0-rc.3"},
      {:opentelemetry_zipkin, "~> 0.4.0"}
    ]
  end

  defp aliases do
    [
      setup: ["deps.get", "cmd --cd assets npm ci"],
      "assets.deploy": [
        "cmd --cd assets npm run deploy",
        "esbuild default --minify",
        "phx.digest"
      ]
    ]
  end
end
