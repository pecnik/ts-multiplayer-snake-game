import SocketIO from "socket.io";
import { Action } from "./Actions";
import { State } from "./data/State";
import { Direction } from "./data/Direction";
import { Snake } from "./data/Snake";
import { dispatch } from "./Dispatch";
import {
    System,
    snakeSpawnSystem,
    snakeInputSystem,
    snakeAdvanceSystem,
    snakeCollisionSystem,
    foodSpawnSystem,
    highScoreSystem
} from "./Systems";
import { getPlayerNameErrors } from "./Selectors";

export function GameServer(io: SocketIO.Server) {
    const state = new State();
    const udpates = new Array<Action>();
    const systems = new Array<System>(
        snakeSpawnSystem,
        snakeInputSystem,
        snakeAdvanceSystem,
        snakeCollisionSystem,
        foodSpawnSystem,
        highScoreSystem
    );

    io.on("connection", socket => {
        socket.on("login", (name: string = "") => {
            const error = getPlayerNameErrors(name);
            if (error) {
                socket.emit("login-error", error);
                return;
            }

            const duplicate = state.snakes.find(snake => snake.name === name);
            if (duplicate !== undefined) {
                const error = `"${name}" is already in use`;
                socket.emit("login-error", error);
                return;
            }

            socket.emit("login-success");
            joinPlayer(socket, name);
        });
    });

    function joinPlayer(socket: SocketIO.Socket, name: string) {
        socket.on("join-game", () => {
            const snake = new Snake(socket.id, name);
            udpates.push(new Action.SYNC_SNAKE(snake));
            socket.emit("sync-state", state);
            console.log("New player: ", snake.name);
        });

        socket.on("input", (input: Direction) => {
            const snake = state.snakes.find(snake => snake.id === socket.id);
            if (snake !== undefined && Direction[input] !== undefined) {
                snake.input = input;
            }
        });

        socket.on("disconnect", () => {
            udpates.push(new Action.REMOVE_SNAKE(socket.id));
        });
    }

    const UPDATE_SCORES = new Action.UPDATE_SCORES();
    setInterval(() => {
        udpates.forEach(action => dispatch(state, action));
        systems.forEach(system => {
            const dispatcher = new Array<Action>();
            system(state, dispatcher);
            dispatcher.forEach(action => dispatch(state, action));
            udpates.push(...dispatcher);
        });

        // Is called every frame
        udpates.push(UPDATE_SCORES);
        dispatch(state, UPDATE_SCORES);

        // Dump
        io.sockets.emit("tick", [...udpates]);
        udpates.splice(0, udpates.length);
    }, 1000 / 10);
}
