defmodule Membrane.Demo.RTP.MixProject do
  use Mix.Project

  @version "0.1.0"

  def project do
    [
      app: :membrane_demo_rtp,
      version: @version,
      elixir: "~> 1.7",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  # Run "mix help compile.app" to learn about applications.
  def application do
    [
      extra_applications: [:logger]
    ]
  end

  # Run "mix help deps" to learn about dependencies.
  defp deps do
    [
      {:membrane_core,
       github: "membraneframework/membrane-core",
       branch: "add-timestamps-to-buffer",
       override: true},
      {:membrane_rtp_plugin,
       github: "membraneframework/membrane_rtp_plugin", branch: "migration-to-buffer-with-pts-dts"},
      {:membrane_element_udp, "~> 0.5.1"},
      {:membrane_h264_ffmpeg_plugin,
       github: "membraneframework/membrane_h264_ffmpeg_plugin",
       branch: "migration-to-buffer-with-pts-dts"},
      {:membrane_rtp_h264_plugin,
       github: "membraneframework/membrane_rtp_h264_plugin",
       branch: "migration-to-buffer-with-pts-dts"},
      {:membrane_opus_plugin,
       github: "membraneframework/membrane_opus_plugin", branch: "parser-adds-pts-timestamps"},
      {:membrane_rtp_opus_plugin, "~> 0.3.0"},
      {:membrane_sdl_plugin, "~> 0.9.0"},
      {:membrane_portaudio_plugin, "~> 0.9.0"},
      {:membrane_hackney_plugin, "~> 0.5.0"},
      {:ex_libsrtp, "~> 0.3.0"},
      {:membrane_realtimer_plugin,
       github: "membraneframework/membrane_realtimer_plugin",
       branch: "migration-to-buffer-with-pts-dts"}
    ]
  end
end
