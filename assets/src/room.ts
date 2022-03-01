import {
  LOCAL_PEER_ID,
  AUDIO_MEDIA_CONSTRAINTS,
  VIDEO_MEDIA_CONSTRAINTS,
  SCREENSHARING_MEDIA_CONSTRAINTS,
} from "./consts";
import {
  addVideoElement,
  getRoomId,
  removeVideoElement,
  setErrorMessage,
  setParticipantsList,
  attachStream,
  setupControls,
  terminateScreensharing,
  attachScreensharing,
  detachScreensharing,
  toggleScreensharing,
} from "./room_ui";
import {
  MembraneWebRTC,
  Peer,
  SerializedMediaEvent,
} from "membrane_rtc_engine";
import { Push, Socket } from "phoenix";
import { parse } from "query-string";

export class Room {
  private customId: string;

  private peers: Peer[] = [];
  private displayName: string;
  private localAudioStream: MediaStream | null = null;
  private localVideoStream: MediaStream | null = null;
  private localScreensharing: MediaStream | null = null;
  private localScreensharingTrackId: string | null = null;

  private ingressWebrtc: MembraneWebRTC;
  private egressWebrtc: MembraneWebRTC;

  private socket;
  private webrtcSocketRefs: string[] = [];
  private webrtcIngressChannel;
  private webrtcEgressChannel;

  private everyPeerMap: Map<string, Peer> = new Map();

  private ingressPeer: Peer = {
    id: "",
    metadata: {},
    trackIdToMetadata: new Map(),
  };
  private egressPeer: Peer = {
    id: "",
    metadata: {},
    trackIdToMetadata: new Map(),
  };

  constructor() {
    this.customId = this.generateRandomId();

    this.socket = new Socket("/socket");
    this.socket.connect();
    this.displayName = this.parseUrl();
    // this.webrtcChannel = this.socket.channel(`room:${getRoomId()}`);
    this.webrtcIngressChannel = this.socket.channel(
      `room:ingress:${getRoomId()}`
    );
    this.webrtcEgressChannel = this.socket.channel(
      `room:egress:${getRoomId()}`
    );

    this.webrtcSocketRefs.push(this.socket.onError(this.leave));
    this.webrtcSocketRefs.push(this.socket.onClose(this.leave));

    this.ingressWebrtc = new MembraneWebRTC(
      {
        callbacks: {
          onSendMediaEvent: (mediaEvent: SerializedMediaEvent) => {
            this.webrtcIngressChannel.push("mediaEvent", { data: mediaEvent });
          },
          onConnectionError: setErrorMessage,
          onJoinSuccess: (peerId, peersInRoom) => {
            console.log("ingress MembraneWebRTC peerID", peerId);
            console.log("peers in ingress MembraneWebRTC", peersInRoom);

            const audioMetadata = { peerCustomId: this.customId };
            this.localAudioStream?.getTracks().forEach((track) => {
              const trackId = this.ingressWebrtc.addTrack(
                track,
                this.localAudioStream!,
                audioMetadata
              );
              this.ingressPeer.trackIdToMetadata.set(trackId, audioMetadata);
            });

            const videoMetadata = { peerCustomId: this.customId };
            this.localVideoStream?.getTracks().forEach((track) => {
              const trackId = this.ingressWebrtc.addTrack(
                track,
                this.localVideoStream!,
                videoMetadata
              );
              this.ingressPeer.trackIdToMetadata.set(trackId, audioMetadata);
            });

            this.ingressPeer.id = peerId;
            this.everyPeerMap.set(this.ingressPeer.id, this.ingressPeer);
            peersInRoom.forEach((peer) => this.everyPeerMap.set(peer.id, peer));
          },
          onJoinError: (metadata) => {
            throw `Peer denied.`;
          },
          onPeerJoined: (peer) => {
            this.everyPeerMap.set(peer.id, peer);
          },
          onPeerLeft: (peer) => {
            // this.everyPeerMap.delete(peer.id);
          },
        },
      },
      this.peerResolver(this.everyPeerMap)
    );

    this.egressWebrtc = new MembraneWebRTC(
      {
        callbacks: {
          onSendMediaEvent: (mediaEvent: SerializedMediaEvent) => {
            this.webrtcEgressChannel.push("mediaEvent", { data: mediaEvent });
          },
          onConnectionError: setErrorMessage,
          onJoinSuccess: (peerId, peersInRoom) => {
            console.log("egress MembraneWebRTC peerID", peerId);
            console.log("peers in egress MembraneWebRTC", peersInRoom);
            this.peers = peersInRoom;
            this.peers.forEach((peer) => {
              addVideoElement(
                peer.metadata.customId,
                peer.metadata.displayName,
                false
              );
            });
            this.updateParticipantsList();

            this.egressPeer.id = peerId;
            this.everyPeerMap.set(this.egressPeer.id, this.egressPeer);
          },
          onJoinError: (metadata) => {
            throw `Peer denied.`;
          },
          onTrackReady: ({ stream, peer, metadata }) => {
            if (metadata.type === "screensharing") {
              attachScreensharing(
                metadata.peerCustomId,
                // `(${peer.metadata.displayName}) Screen`, resolve real peer id
                `() Screen`,
                stream!
              );
            } else {
              attachStream(metadata.peerCustomId, {
                audioStream: stream,
                videoStream: stream,
              });
            }
          },
          onTrackRemoved: (ctx) => {
            if (ctx.metadata.type === "screensharing") {
              detachScreensharing(ctx.metadata.peerCustomId);
            }
          },
          onPeerJoined: (peer) => {
            console.log("perr joined to egress node", peer);

            this.everyPeerMap.set(peer.id, peer);

            this.peers.push(peer);
            this.updateParticipantsList();
            addVideoElement(
              peer.metadata.customId,
              peer.metadata.displayName,
              false
            );
          },
          onPeerLeft: (peer) => {
            console.log("perr left egress node", peer);

            // this.everyPeerMap.delete(peer.id);

            this.peers = this.peers.filter(
              (p) => p.metadata.customId !== peer.metadata.customId
            );
            removeVideoElement(peer.metadata.customId);
            this.updateParticipantsList();
          },
        },
      },
      this.peerResolver(this.everyPeerMap)
    );

    this.webrtcIngressChannel.on("mediaEvent", (event: any) =>
      this.ingressWebrtc.receiveMediaEvent(event.data)
    );

    this.webrtcEgressChannel.on("mediaEvent", (event: any) =>
      this.egressWebrtc.receiveMediaEvent(event.data)
    );
  }

  public init = async () => {
    try {
      this.localAudioStream = await navigator.mediaDevices.getUserMedia(
        AUDIO_MEDIA_CONSTRAINTS
      );
    } catch (error) {
      console.error("Error while getting local audio stream", error);
    }

    const mediaDevices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = mediaDevices.filter(
      (device) => device.kind === "videoinput"
    );

    for (const device of videoDevices) {
      const video = VIDEO_MEDIA_CONSTRAINTS.video as MediaTrackConstraints;
      const constraints = {
        ...VIDEO_MEDIA_CONSTRAINTS,
        video: {
          ...video,
          deviceId: { exact: device.deviceId },
        },
      };

      try {
        this.localVideoStream = await navigator.mediaDevices.getUserMedia(
          constraints
        );

        break;
      } catch (error) {
        console.error("Error while getting local video stream", error);
      }
    }

    addVideoElement(LOCAL_PEER_ID, "Me", true);

    attachStream(LOCAL_PEER_ID, {
      audioStream: this.localAudioStream,
      videoStream: this.localVideoStream,
    });

    await this.phoenixChannelPushResult(this.webrtcIngressChannel.join());
    await this.phoenixChannelPushResult(this.webrtcEgressChannel.join());
  };

  public join = () => {
    const onScreensharingEnd = async () => {
      if (!this.localScreensharing) return;

      this.localScreensharing.getTracks().forEach((track) => track.stop());
      this.localScreensharing = null;

      this.ingressWebrtc.removeTrack(this.localScreensharingTrackId!);
      detachScreensharing(LOCAL_PEER_ID);
    };

    const onScreensharingStart = async () => {
      if (this.localScreensharing) return;

      this.localScreensharing = await navigator.mediaDevices.getDisplayMedia(
        SCREENSHARING_MEDIA_CONSTRAINTS
      );

      this.localScreensharingTrackId = this.ingressWebrtc.addTrack(
        this.localScreensharing.getVideoTracks()[0],
        this.localScreensharing,
        { type: "screensharing" }
      );

      // listen for screensharing stop via browser controls instead of ui buttons
      this.localScreensharing.getVideoTracks().forEach((track) => {
        track.onended = () => {
          toggleScreensharing(null, onScreensharingEnd)();
        };
      });

      attachScreensharing(
        LOCAL_PEER_ID,
        "(Me) Screen",
        this.localScreensharing
      );
    };

    const callbacks = {
      onLeave: this.leave,
      onScreensharingStart,
      onScreensharingEnd,
    };

    setupControls(
      {
        audioStream: this.localAudioStream,
        videoStream: this.localVideoStream,
      },
      callbacks
    );

    addVideoElement(this.customId, this.displayName, false);

    this.ingressPeer.metadata = {
      displayName: this.displayName,
      customId: this.customId,
    };
    this.egressPeer.metadata = {
      displayName: this.displayName,
      customId: this.customId,
    };

    this.ingressWebrtc.join(this.ingressPeer.metadata);
    this.egressWebrtc.join(this.egressPeer.metadata);
  };

  private leave = () => {
    this.ingressWebrtc.leave();
    this.egressWebrtc.leave();

    this.webrtcIngressChannel.leave();
    this.webrtcEgressChannel.leave();

    this.socket.off(this.webrtcSocketRefs);
    while (this.webrtcSocketRefs.length > 0) {
      this.webrtcSocketRefs.pop();
    }
  };

  private parseUrl = (): string => {
    const { display_name: displayName } = parse(document.location.search);

    // remove query params without reloading the page
    window.history.replaceState(null, "", window.location.pathname);

    return displayName as string;
  };

  private updateParticipantsList = (): void => {
    const participantsNames = this.peers.map((p) => p.metadata.displayName);

    if (this.displayName) {
      participantsNames.push(this.displayName);
    }

    setParticipantsList(participantsNames);
  };

  private phoenixChannelPushResult = async (push: Push): Promise<any> => {
    return new Promise((resolve, reject) => {
      push
        .receive("ok", (response: any) => resolve(response))
        .receive("error", (response: any) => reject(response));
    });
  };

  private generateRandomId = (): string => {
    const chars =
      "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890";
    const charsArray = chars.split("");
    return Array.from(Array(32).keys())
      .map((i) => charsArray[Math.floor(Math.random() * charsArray.length)])
      .join("");
  };

  private peerResolver = (
    peersMap: Map<string, Peer>
  ): ((id: string) => Peer) => {
    return (id) => {
      console.log("peerResolver peersMap", peersMap);
      console.log("peersResolver id", id);

      return peersMap.get(id)!;
    };
  };
}
